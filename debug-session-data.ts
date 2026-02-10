import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugUserSessions() {
  const userId = 'dc869fa0-8652-4df1-bede-93a776ed70eb'; // joseartigas281@gmail.com

  console.log('=== INVESTIGATING SESSIONS FOR USER:', userId, '===\n');

  // Get all sessions for this user
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (sessionsError) {
    console.error('Error fetching sessions:', sessionsError);
    return;
  }

  console.log(`Found ${sessions?.length || 0} sessions\n`);

  // 3. For each session, get detailed recording info
  for (const session of sessions || []) {
    console.log('='.repeat(80));
    console.log(`SESSION: ${session.id}`);
    console.log(`Created: ${session.created_at}`);
    console.log(`Focus Area: ${session.focus_area || 'N/A'}`);
    console.log('---');

    // Get recordings for this session
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    if (recordingsError) {
      console.error('Error fetching recordings:', recordingsError);
      continue;
    }

    console.log(`\nRecordings: ${recordings?.length || 0} questions\n`);

    // Analyze each recording
    for (let i = 0; i < (recordings || []).length; i++) {
      const recording = recordings[i];
      // Print all columns to understand structure
      if (i === 0) {
        console.log(`  Available columns: ${Object.keys(recording).join(', ')}\n`);
      }
      const questionPreview = recording.question_text?.substring(0, 80).replace(/\n/g, ' ') || 'N/A';
      console.log(`  Recording ${i + 1}:`);
      console.log(`    ID: ${recording.id}`);
      console.log(`    Question: ${questionPreview}...`);
      console.log(`    Duration: ${recording.duration || 'N/A'}s`);
      console.log(`    Video URL: ${recording.video_url ? 'EXISTS' : 'MISSING ❌'}`);
      console.log(`    Transcript: ${recording.transcript ? `EXISTS (${recording.transcript.length} chars)` : 'MISSING ❌'}`);
      console.log(`    AI Feedback: ${recording.ai_feedback ? `EXISTS (${recording.ai_feedback.length} chars)` : 'MISSING ❌'}`);
      console.log(`    Framework Examples: ${recording.framework_examples ? 'EXISTS' : 'MISSING ❌'}`);
      console.log(`    Communication Analysis: ${recording.communication_analysis ? 'EXISTS' : 'MISSING ❌'}`);

      // Check speech metrics
      const hasMetrics = recording.filler_word_count !== null ||
                        recording.words_per_minute !== null ||
                        recording.clarity_score !== null;
      console.log(`    Speech Metrics: ${hasMetrics ? 'EXISTS' : 'MISSING ❌'}`);

      if (hasMetrics) {
        console.log(`      - Filler words: ${recording.filler_word_count}`);
        console.log(`      - WPM: ${recording.words_per_minute}`);
        console.log(`      - Clarity: ${recording.clarity_score}`);
        console.log(`      - Pacing: ${recording.pacing_score}`);
      }

      console.log(`    Created: ${recording.created_at}`);
      console.log(`    Updated: ${recording.updated_at}`);
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('\n');
  }

  // 4. Summary
  console.log('\n=== SUMMARY ===');

  // Count recordings with missing data
  let totalRecordings = 0;
  let missingTranscripts = 0;
  let missingFeedback = 0;
  let missingMetrics = 0;
  let missingFramework = 0;
  let missingComm = 0;

  for (const session of sessions || []) {
    const { data: recs } = await supabase
      .from('recordings')
      .select('transcript, ai_feedback, filler_word_count, framework_examples, communication_analysis')
      .eq('session_id', session.id);

    for (const rec of recs || []) {
      totalRecordings++;
      if (!rec.transcript) missingTranscripts++;
      if (!rec.ai_feedback) missingFeedback++;
      if (rec.filler_word_count === null) missingMetrics++;
      if (!rec.framework_examples) missingFramework++;
      if (!rec.communication_analysis) missingComm++;
    }
  }

  console.log(`Total sessions: ${sessions?.length || 0}`);
  console.log(`Total recordings: ${totalRecordings}`);
  console.log(`Recordings missing transcripts: ${missingTranscripts} (${((missingTranscripts/totalRecordings)*100).toFixed(1)}%)`);
  console.log(`Recordings missing AI feedback: ${missingFeedback} (${((missingFeedback/totalRecordings)*100).toFixed(1)}%)`);
  console.log(`Recordings missing framework examples: ${missingFramework} (${((missingFramework/totalRecordings)*100).toFixed(1)}%)`);
  console.log(`Recordings missing communication analysis: ${missingComm} (${((missingComm/totalRecordings)*100).toFixed(1)}%)`);
  console.log(`Recordings missing speech metrics: ${missingMetrics} (${((missingMetrics/totalRecordings)*100).toFixed(1)}%)`);
}

debugUserSessions()
  .then(() => {
    console.log('\nDebug complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
