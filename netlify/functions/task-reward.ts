
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Helper to get VN Date String (YYYY-MM-DD)
const getVNDateString = (date: Date = new Date()) => {
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    const { taskType } = JSON.parse(event.body || '{}');
    
    if (taskType === 'share_app') {
        const { data: userData } = await supabaseAdmin.from('users').select('spin_tickets, last_share_app_at').eq('id', user.id).single();
        
        const today = getVNDateString();
        const lastShareDate = userData?.last_share_app_at ? getVNDateString(new Date(userData.last_share_app_at)) : null;

        if (lastShareDate === today) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Bạn đã nhận thưởng nhiệm vụ này hôm nay rồi.' }) };
        }

        const newTickets = (userData?.spin_tickets || 0) + 1;
        
        await supabaseAdmin.from('users').update({ 
            spin_tickets: newTickets,
            last_share_app_at: new Date().toISOString()
        }).eq('id', user.id);
        
        return { statusCode: 200, body: JSON.stringify({ tickets: newTickets }) };
    }
    
    // Generic fallback for other tasks if any
    if (taskType === 'share_image') {
         const { data: userData } = await supabaseAdmin.from('users').select('spin_tickets').eq('id', user.id).single();
         const newTickets = (userData?.spin_tickets || 0) + 1;
         await supabaseAdmin.from('users').update({ spin_tickets: newTickets }).eq('id', user.id);
         return { statusCode: 200, body: JSON.stringify({ tickets: newTickets }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid task type' }) };
};

export { handler };