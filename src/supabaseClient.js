import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pmvxnetpbxuzkrxitioc.supabase.co';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';

export const supabase = createClient(supabaseUrl, supabaseKey);