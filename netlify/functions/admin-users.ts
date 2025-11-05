import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    const { user } = context.clientContext as any;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('is_admin')
        .eq('id', user.sub)
        .single();
    
    if (userError || !userData?.is_admin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden. Admin access required.' }) };
    }

    switch (event.httpMethod) {
        case 'GET': {
            // Get all users
            const { data, error } = await supabaseAdmin
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            }
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        case 'PUT': {
            // Update a specific user's data (e.g., diamonds, is_admin)
            const { userId, updates } = JSON.parse(event.body || '{}');
            if (!userId || !updates) {
                return { statusCode: 400, body: JSON.stringify({ error: 'User ID and updates are required.' }) };
            }

            // Sanitize updates to prevent updating sensitive fields unintentionally
            const allowedUpdates: { [key: string]: any } = {};
            if (updates.diamonds !== undefined) allowedUpdates.diamonds = updates.diamonds;
            if (updates.xp !== undefined) allowedUpdates.xp = updates.xp;
            if (updates.is_admin !== undefined) allowedUpdates.is_admin = updates.is_admin;
            if (Object.keys(allowedUpdates).length === 0) {
                 return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update.' }) };
            }
            
            const { data, error } = await supabaseAdmin
                .from('users')
                .update(allowedUpdates)
                .eq('id', userId)
                .select()
                .single();

            if (error) {
                return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            }
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };
