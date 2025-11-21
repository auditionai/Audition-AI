
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 };

    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401 };
    const token = authHeader.split(' ')[1];
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return { statusCode: 401 };

    const { taskType } = JSON.parse(event.body || '{}');
    
    // Simple throttle/check (Real impl needs better validation)
    // For share_app, we limit to once per day
    if (taskType === 'share_app' || taskType === 'share_image') {
        // Check if already done today?
        // For simplicity in demo, we just award it. In production, log tasks in a 'user_tasks' table.
        
        const { data: userData } = await supabaseAdmin.from('users').select('spin_tickets').eq('id', user.id).single();
        const newTickets = (userData?.spin_tickets || 0) + 1;
        
        await supabaseAdmin.from('users').update({ spin_tickets: newTickets }).eq('id', user.id);
        
        return { statusCode: 200, body: JSON.stringify({ tickets: newTickets }) };
    }

    return { statusCode: 400 };
};

export { handler };
