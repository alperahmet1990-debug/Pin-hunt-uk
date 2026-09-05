import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.from("community_posts").select("id, title, body, post_type, author_id").ilike("title", "%Underminer%");
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
