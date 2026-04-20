/**
 * Claude AI Service
 * Handles question generation and feedback generation using Claude 3.5 Sonnet
 */

import Anthropic from '@anthropic-ai/sdk';
import { SessionType, Question, SessionContext } from '@/types/interview';

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Helper function to retry API calls with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      // Check if this is a retryable error (529 overloaded or 5xx errors)
      const errWithStatus = error as { status?: number };
      const isRetryable = errWithStatus?.status === 529 || ((errWithStatus?.status ?? 0) >= 500 && (errWithStatus?.status ?? 0) < 600);
      const isLastAttempt = attempt === maxRetries;

      if (!isRetryable || isLastAttempt) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`API overloaded (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

// System prompts for different session types (optimized for speed + quality)
const SYSTEM_PROMPTS = {
  'job-interview': `You are an expert technical recruiter conducting a REAL interview. Generate 5-7 questions that flow naturally.

Structure (critical for realism):
1. START with behavioral warmup ("Tell me about yourself" or "Walk me through your background")
2. Ask about relevant experience (mix behavioral + technical) - 2-3 questions
3. Communication/explanation question (1 question) - TEST their ability to explain complex concepts
4. Technical depth questions specific to the role - 1-2 questions
5. END with situational or closing questions

Quality Requirements:
- Flow from easy → challenging (build rapport like a real interviewer)
- Extract SPECIFIC technologies/requirements from the job description
- Mix behavioral (30%), technical (40%), communication (20%), situational (10%)
- Include at least ONE question that tests ability to explain concepts clearly
- Sound like questions a hiring manager would ACTUALLY ask
- Reference specific technologies/requirements from the job description
- Avoid generic questions - tailor every question to their exact role

Communication Question Types (pick ONE that fits the role):
- "Explain [specific technology from job] as if you're talking to a non-technical stakeholder"
- "Walk me through how you'd communicate a technical roadblock to your product team"
- "How would you explain [complex technical concept] to a junior developer?"
- "Describe a time when you had to simplify a technical decision for leadership"

Example for Senior React Engineer:
1. "Tell me about yourself and what draws you to this role" (warmup)
2. "Describe a complex React application you've built from scratch" (experience)
3. "How do you approach state management in large-scale React apps?" (technical)
4. "Explain React's reconciliation algorithm to a designer who wants to understand performance" (communication)
5. "Tell me about a time you had to make a critical architectural decision" (situational)`,

  'presentation': `You are an experienced executive presentation coach. Generate 5-7 prompts that flow like a REAL presentation.

Structure (critical for realistic practice):
1. START with opening/introduction
2. Main content delivery (test clarity and structure) - 1-2 prompts
3. Guide through main content sections
4. Simulate tough Q&A from the specific audience
5. END with closing/call-to-action

Quality Requirements:
- Flow naturally through presentation arc (opening → body → Q&A → closing)
- Be HIGHLY SPECIFIC to their exact topic and audience type
- Mix presentation delivery (40%), clarity/structure tests (20%), Q&A simulation (30%), closing (10%)
- Include prompts that test ability to simplify complex ideas
- Include realistic tough questions from the specific audience (board, investors, customers, etc.)
- Challenge assumptions and force clarity on key points
- Reference their specific product/topic details

Clarity/Structure Prompts (include 1-2):
- "Summarize your key message in one clear sentence"
- "Explain [complex concept from their topic] using a simple analogy"
- "What are the 3 most important takeaways for your audience?"
- "How would you explain [technical aspect] to a non-technical board member?"`,

  'internship-interview': `You are an experienced recruiter interviewing candidates for internships and entry-level positions. Generate 5-7 questions that flow naturally for someone early in their career.

Core Philosophy:
- Internship interviews test POTENTIAL and FIT, not expertise
- You are assessing: can this person do the job? Are they curious enough to learn it? Will they contribute to the team?
- Keep behavioral weight HIGH — most questions should reveal character, work ethic, and thinking style
- Domain-specific questions should still be framed around potential, not past mastery

Structure (critical for realism):
1. START with introductory warmup ("Tell me about yourself" or "What interests you about this internship?")
2. Academic/project experience questions tied to the role - 2 questions
3. Learning ability, curiosity, and growth mindset question - 1 question
4. Domain-relevant "how would you approach this?" question - 1 question (situational, not experience-required)
5. END with motivation or fit question

Quality Requirements:
- Flow from easy → moderate difficulty (build confidence for early-career candidates)
- Focus on potential, learning ability, and transferable skills — NOT extensive work experience
- Mix behavioral (40%), academic/project (25%), situational/domain (25%), motivation (10%)
- Sound like questions a real hiring manager would ask an intern candidate
- Reference specific requirements and field from the internship description
- Avoid questions that assume prior professional work experience

Domain Adaptation (CRITICAL — identify the field from the internship description):
- Tech / Engineering internships: Include one question on a relevant technical concept or tool (framed as "how would you approach learning X" or "walk me through your thinking on Y") — treat similarly to a junior job interview but lighter on depth
- Finance / Consulting internships: Include one question on analytical thinking, attention to detail, or market/business awareness (e.g., "What do you know about X market/sector?" or "Walk me through how you'd analyze a problem like Y")
- Marketing / Creative internships: Include one question on brand thinking, audience awareness, or campaign/content ideas (e.g., "How would you approach building a campaign for X audience?")
- Operations / Supply Chain internships: Include one question on process thinking, prioritization, or data organization
- Research / Science internships: Include one question on methodology, curiosity, or how they'd approach an ambiguous research problem
- General / Unclear domain: Default to behavioral and academic project questions — do NOT invent domain requirements

Question Types (mix these appropriately):
- Academic projects: "Tell me about a challenging project you worked on in school"
- Learning ability: "Describe a time you had to learn a new skill quickly — how did you approach it?"
- Communication: "Explain [relevant concept from internship field] to someone unfamiliar with it"
- Teamwork: "Tell me about a time you had a disagreement with a teammate — how did you handle it?"
- Domain situational: "How would you approach [entry-level domain task relevant to their field]?"
- Motivation: "Why this industry? Why now?"`,
};

// Generate questions based on context
export async function generateQuestions(
  context: SessionContext
): Promise<Question[]> {
  const { sessionType, context: userContext, difficulty = 'intermediate', focusAreas = [] } = context;

  const systemPrompt = SYSTEM_PROMPTS[sessionType];

  const userPrompt = `
Session Type: ${sessionType}
Difficulty Level: ${difficulty}
${focusAreas.length > 0 ? `Focus Areas: ${focusAreas.join(', ')}` : ''}

Context:
${userContext}

Generate 5-7 highly relevant questions/prompts for this session.

IMPORTANT: Return ONLY a valid JSON array with this exact structure:
[
  {
    "id": "q1",
    "text": "The question text here",
    "type": "technical" | "behavioral" | "situational" | "challenge",
    "difficulty": 1-5,
    "followUpHints": ["hint 1", "hint 2"]
  }
]

No markdown, no code blocks, no explanations - just the raw JSON array.`;

  try {
    const message = await retryWithBackoff(async () => {
      return await anthropic.messages.create({
        model: 'claude-haiku-4-5', // ⚡ Latest Haiku (Oct 2025) - fast and cost-effective for question generation
        max_tokens: 1500, // Headroom so 5–7 prompts with follow-up hints don't truncate mid-JSON
        system: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const } // ⚡ Cache system prompts (90% token savings on repeats)
          }
        ],
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });
    });

    // Extract text from response
    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('');

    // Robust JSON-array extraction. Haiku occasionally:
    //   - wraps the array in ```json … ``` or plain ``` … ```
    //   - prepends a preamble ("Here are 5 prompts:")
    //   - appends trailing prose ("Let me know if …")
    // We grab the first '[' through its matching ']' so any of those are tolerated.
    const extractJsonArray = (raw: string): string => {
      const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      const start = trimmed.indexOf('[');
      const end = trimmed.lastIndexOf(']');
      if (start === -1 || end === -1 || end < start) return trimmed; // fall through to JSON.parse
      return trimmed.slice(start, end + 1);
    };

    const cleanedResponse = extractJsonArray(responseText);

    // Parse JSON response (log a slice of the raw text on failure so we can debug in prod)
    let questions: Question[];
    try {
      questions = JSON.parse(cleanedResponse) as Question[];
    } catch (parseError) {
      console.error('generate-questions: JSON parse failed', {
        sessionType,
        rawHead: responseText.slice(0, 500),
        rawTail: responseText.slice(-200),
        cleanedHead: cleanedResponse.slice(0, 200),
      });
      throw parseError;
    }

    // Replace string IDs with proper UUIDs for database compatibility
    // The database expects UUID for question_id, but Claude generates simple IDs like "q1", "q2"
    const questionsWithUUIDs = questions.map((question) => ({
      ...question,
      id: crypto.randomUUID(), // Generate proper UUID for each question
    }));

    return questionsWithUUIDs;
  } catch (error: unknown) {
    console.error('Error generating questions with Claude:', error);

    // Provide specific error message for overload
    if ((error as { status?: number })?.status === 529) {
      throw new Error('Claude API is temporarily overloaded. Please wait 30-60 seconds and try again.');
    }

    throw new Error('Failed to generate questions. Please try again.');
  }
}

// Generate feedback based on analysis results
export async function generateFeedback(params: {
  sessionType: SessionType;
  question: string;
  transcript: string;
  context: string;
  analysisData?: {
    wordsPerMinute?: number;
    fillerWordCount?: number;
    eyeContactPercentage?: number;
    dominantEmotion?: string;
    presenceScore?: number; // Sprint 4: Combined video presence score
  };
}): Promise<{
  overallScore: number;
  contentScore?: number;
  communicationScore?: number;
  deliveryScore?: number;
  summary: string;
  communicationPatterns?: {
    usedStructure?: string;
    clarityLevel?: string;
    concisenessLevel?: string;
    exampleQuality?: string;
  };
  strengths: Array<{ area: string; detail: string }>;
  improvements: Array<{ area: string; detail: string; suggestion: string; example?: string; priority: 'high' | 'medium' | 'low' }>;
  nextSteps: string[];
}> {
  const { sessionType, question, transcript, context, analysisData } = params;

  const systemPrompt = `You are an expert interview coach AND communication specialist.

Evaluate on THREE dimensions:
1. **Content Quality** (0-100): Did they answer the question? Technical accuracy?
2. **Communication Effectiveness** (0-100): Structure, clarity, conciseness, storytelling
3. **Delivery** (0-100): Pace, filler words, presence, eye contact

Communication Framework to Evaluate:
- STRUCTURE: Did they use a clear framework (STAR, Problem-Solution, Pyramid Principle)?
- CLARITY: Were key points easy to understand? Any unexplained jargon?
- CONCISENESS: Did they ramble or stay focused? Appropriate length?
- STORYTELLING: Did they engage with concrete examples?
- AUDIENCE AWARENESS: Did they adjust complexity appropriately?

For framework-based examples:
- Use [PLACEHOLDERS] for user-specific content
- Show the structure, not word-for-word scripts
- Include coaching notes on what to include
- Make it adaptable to any similar situation

Provide specific, actionable feedback with FRAMEWORK EXAMPLES (not scripts).`;


  const userPrompt = `
Session Type: ${sessionType}
Original Context: ${context}

Question Asked: ${question}

User's Response:
${transcript}

${analysisData ? `
Delivery Metrics:
- Speaking Pace: ${analysisData.wordsPerMinute || 'N/A'} words/minute
- Filler Words: ${analysisData.fillerWordCount || 'N/A'} instances
${analysisData.eyeContactPercentage !== undefined ? `- Eye Contact: ${analysisData.eyeContactPercentage}%` : ''}
${analysisData.dominantEmotion ? `- Dominant Emotion: ${analysisData.dominantEmotion}` : ''}
${analysisData.presenceScore !== undefined ? `- Overall Presence Score: ${analysisData.presenceScore}%` : ''}
` : ''}

First, analyze their COMMUNICATION PATTERNS:
1. Structure: Did they use STAR, chronological, problem-solution, or was it unstructured?
2. Clarity: Crystal clear, mostly clear, somewhat unclear, or confusing?
3. Conciseness: Concise, appropriate, verbose, or rambling?
4. Examples: Specific examples, vague examples, or no examples?

Then provide detailed feedback in JSON format:
{
  "overallScore": 0-100,
  "contentScore": 0-100,
  "communicationScore": 0-100,
  "deliveryScore": 0-100,
  "summary": "2-3 sentence overview focusing on communication effectiveness",
  "communicationPatterns": {
    "usedStructure": "STAR method" | "chronological" | "unstructured" | "problem-solution" | "pyramid principle",
    "clarityLevel": "crystal clear" | "mostly clear" | "somewhat unclear" | "confusing",
    "concisenessLevel": "concise" | "appropriate" | "verbose" | "rambling",
    "exampleQuality": "specific examples" | "vague examples" | "no examples"
  },
  "strengths": [
    {"area": "strength category", "detail": "specific observation"}
  ],
  "improvements": [
    {
      "area": "improvement category",
      "detail": "specific issue observed",
      "suggestion": "actionable advice",
      "example": "Framework with [PLACEHOLDERS]: e.g., 'At [YOUR COMPANY], I faced [SITUATION]...' - Keep structure, adapt content",
      "priority": "high" | "medium" | "low"
    }
  ],
  "nextSteps": ["actionable item 1", "actionable item 2", "actionable item 3"]
}

IMPORTANT:
- For top 2-3 improvements (priority: high), include "example" field with FRAMEWORK (not word-for-word script)
- Use [PLACEHOLDERS] like [YOUR COMPANY], [SPECIFIC TECHNOLOGY], [METRIC/RESULT]
- Add coaching notes after the framework
- Make examples adaptable to any similar situation

Return ONLY the JSON object, no markdown or code blocks.`;

  try {
    const message = await retryWithBackoff(async () => {
      return await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929', // Latest Sonnet 4.5 (Sept 2025) - best for nuanced feedback analysis
        max_tokens: 4096, // Increased for Claude 4.x (more verbose than 3.5 Sonnet, needs more tokens for complete JSON)
        system: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const } // ⚡ Cache system prompts (90% token savings on repeats)
          }
        ],
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });
    });

    // Extract text from response
    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('');

    // Strip markdown code blocks if present (Claude 4.x sometimes wraps JSON in ```json ... ```)
    const cleanedResponse = responseText.trim().replace(/^```json\s*|\s*```$/g, '');

    // Parse JSON response
    let feedback;
    try {
      feedback = JSON.parse(cleanedResponse);
    } catch (parseError) {
      // Log the problematic response for debugging
      console.error('Failed to parse JSON response from Claude:',parseError);
      console.error('Response text (first 500 chars):', cleanedResponse.substring(0, 500));
      console.error('Response text (last 500 chars):', cleanedResponse.substring(cleanedResponse.length - 500));
      throw parseError;
    }

    return feedback;
  } catch (error: unknown) {
    console.error('Error generating feedback with Claude:', error);

    // Provide specific error message for overload
    if ((error as { status?: number })?.status === 529) {
      throw new Error('Claude API is temporarily overloaded. Please wait 30-60 seconds and try again.');
    }

    throw new Error('Failed to generate feedback. Please try again.');
  }
}
