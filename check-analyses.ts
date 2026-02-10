import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAnalyses() {
  const sessionId = 'd9aa9c25-e771-4a22-8636-284389e80803'; // Most recent session

  console.log('=== CHECKING ANALYSES TABLE ===\n');

  // Get all recordings for this session
  const { data: recordings } = await supabase
    .from('recordings')
    .select('id, duration, transcript')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  console.log(`Found ${recordings?.length || 0} recordings\n`);

  // Check analyses table
  for (let i = 0; i < (recordings || []).length; i++) {
    const rec = recordings[i];
    console.log(`Recording ${i + 1}:`);
    console.log(`  ID: ${rec.id}`);
    console.log(`  Duration: ${rec.duration || 'NULL'}`);
    console.log(`  Has Transcript: ${rec.transcript ? 'YES' : 'NO'}`);

    // Check if there's an analysis
    const { data: analyses, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('recording_id', rec.id);

    if (error) {
      console.log(`  Analyses: ERROR - ${error.message}`);
    } else if (analyses && analyses.length > 0) {
      console.log(`  Analyses: ${analyses.length} found`);
      analyses.forEach((a, idx) => {
        console.log(`    Analysis ${idx + 1}:`);
        console.log(`      Type: ${a.analysis_type || 'N/A'}`);
        console.log(`      Content length: ${JSON.stringify(a.content || {}).length} chars`);
      });
    } else {
      console.log(`  Analyses: NONE ❌`);
    }
    console.log('');
  }
}

checkAnalyses()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
