
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };
    }

    // FIX: Use Supabase v2 `auth.getUser` by casting to any
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);

    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
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
            const { userId, updates } = JSON.parse(event.body || '{}');
            if (!userId || !updates) {
                return { statusCode: 400, body: JSON.stringify({ error: 'User ID and updates are required.' }) };
            }

            // 1. Handle password update separately
            if (updates.password && typeof updates.password === 'string' && updates.password.length >= 6) {
                // FIX: Use Supabase v2 `auth.admin.updateUserById` by casting auth to any
                const { error: passwordUpdateError } = await (supabaseAdmin.auth as any).admin.updateUserById(
                    userId,
                    { password: updates.password }
                );
                if (passwordUpdateError) {
                    return { statusCode: 500, body: JSON.stringify({ error: `Password update failed: ${passwordUpdateError.message}` }) };
                }
            }

            // 2. Handle profile data update
            const allowedUpdates: { [key: string]: any } = {};
            if (updates.diamonds !== undefined) allowedUpdates.diamonds = Number(updates.diamonds);
            if (updates.xp !== undefined) allowedUpdates.xp = Number(updates.xp);
            if (updates.is_admin !== undefined) allowedUpdates.is_admin = Boolean(updates.is_admin);
            
            if (Object.keys(allowedUpdates).length > 0) {
                 // Chain .select() to .update() to get the updated record immediately
                 const { data: updatedData, error: profileUpdateError } = await supabaseAdmin
                    .from('users')
                    .update(allowedUpdates)
                    .eq('id', userId)
                    .select()
                    .single();
                
                if (profileUpdateError) {
                    return { statusCode: 500, body: JSON.stringify({ error: `Profile update failed: ${profileUpdateError.message}` }) };
                }
                
                return { statusCode: 200, body: JSON.stringify(updatedData) };
            }
            
            // 3. If no profile updates (e.g. only password), just fetch and return user
            const { data: finalUserData, error: fetchError } = await supabaseAdmin
                .from('users')
                .select()
                .eq('id', userId)
                .single();

            if (fetchError) {
                 return { statusCode: 500, body: JSON.stringify({ error: `Failed to fetch updated user: ${fetchError.message}` }) };
            }
            
            return { statusCode: 200, body: JSON.stringify(finalUserData) };
        }

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };
