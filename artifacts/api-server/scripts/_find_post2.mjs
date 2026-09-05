import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.from("community_posts").select("*").limit(1);
if (error) throw error;
console.log(Object.keys(data[0] ?? {}));
