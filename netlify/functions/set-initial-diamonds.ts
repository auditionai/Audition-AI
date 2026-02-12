import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Authenticate user
    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();

        if (profileError || !userProfile) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User profile not found.' }) };
        }
        
        // Default diamond amount on user creation is 25.
        // This function sets it to 10 for new users.
        // The check ensures we only do this once for new users and don't override other diamond transactions.
        if (userProfile.diamonds === 25) {
             const { data, error: updateError } = await supabaseAdmin
                .from('users')
                .update({ diamonds: 10 })
                .eq('id', user.id)
                .select('diamonds')
                .single();
            
            if (updateError) throw updateError;
            
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        return { statusCode: 200, body: JSON.stringify({ message: 'No update needed.', diamonds: userProfile.diamonds }) };

    } catch (error: any) {
        console.error("Set initial diamonds failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };