/**
 * Canonical test fixtures for the audit.
 *
 * Each fixture is a realistic JD the AI should produce RELEVANT questions for.
 * The probe keywords are a structural pre-check: if Claude returns questions
 * that contain ZERO of these keywords, something is clearly wrong before we
 * even call the semantic evaluator.
 */

export interface Fixture {
  id: string;
  sessionType: 'job-interview' | 'internship-interview' | 'presentation';
  jd: string;
  probeKeywords: string[];   // at least ONE must appear in the generated questions
  sampleAnswer: string;      // used for transcript + feedback checkpoints
}

export const FIXTURES: Fixture[] = [
  {
    id: 'frontend-eng',
    sessionType: 'job-interview',
    jd: `We are hiring a Senior Frontend Engineer to lead our React and TypeScript
work. You will own our component library, improve performance on our Next.js
app (hydration, Core Web Vitals, bundle size), and collaborate with designers
on accessible interfaces. 5+ years of frontend experience required.`,
    probeKeywords: ['react', 'typescript', 'next', 'performance', 'component', 'accessibility', 'frontend'],
    sampleAnswer: `At my last role I led the migration from a legacy Angular app
to Next.js 13 with the App Router. I cut our largest contentful paint from
3.2 seconds to 1.4 by splitting the bundle, using React server components
for the heavy data grid, and preloading above-the-fold fonts. I also owned
the component library built on Radix primitives — fully accessible, typed
with TypeScript generics, tested with React Testing Library.`,
  },
  {
    id: 'product-manager',
    sessionType: 'job-interview',
    jd: `Senior Product Manager, Growth. Own our activation funnel end-to-end.
Run experiments, define north-star metrics, partner with engineering and
design. You should be comfortable with SQL, A/B testing methodology, and
writing PRDs. Previous B2C subscription experience preferred.`,
    probeKeywords: ['product', 'growth', 'activation', 'experiment', 'metric', 'funnel', 'a/b', 'prd'],
    sampleAnswer: `I led growth at a consumer fintech where we lifted day-7
activation from 18 percent to 34 percent in two quarters. The biggest
unlock was reducing our onboarding from nine steps to four, validated with
a three-arm A/B test powered for a 2 percent minimum detectable effect.
I write my PRDs starting from the customer problem and the metric we plan
to move, never starting from the solution.`,
  },
  {
    id: 'q4-roadmap',
    sessionType: 'presentation',
    jd: `Q4 Product Roadmap presentation to the executive team.
Need to cover: prioritization framework, three key bets, resourcing asks,
success metrics, and risk mitigation.`,
    probeKeywords: ['roadmap', 'priorit', 'metric', 'resource', 'risk', 'bet', 'q4'],
    sampleAnswer: `For Q4 we are placing three bets: enterprise SSO to unlock
our ten largest prospects, mobile app parity to stop churning field users,
and a redesigned settings area to reduce our top support volume. We are
measuring them on ARR committed, weekly active mobile users, and tickets
deflected respectively. The biggest risk is mobile — we need one more iOS
engineer or we will slip by four weeks.`,
  },
];

export function pickFixture(runIndex: number): Fixture {
  return FIXTURES[runIndex % FIXTURES.length];
}
