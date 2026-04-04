import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pmvxnetpbxuzkrxitioc.supabase.co';
const supabaseKey = 'sb_publishable_lHM-diOIBtElXTkgq8tEvg_hIrCcKqH';

export const supabase = createClient(supabaseUrl, supabaseKey);