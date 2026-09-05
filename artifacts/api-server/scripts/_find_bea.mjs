import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.from("profiles").select("id, username, display_name, location").ilike("display_name", "%Bea%");
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
