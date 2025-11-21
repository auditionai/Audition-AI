
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    // GET: Fetch Wheel Config & User Tickets
    if (event.httpMethod === 'GET') {
        const { data: rewards } = await supabaseAdmin.from('lucky_wheel_rewards').select('*').eq('is_active', true).order('display_order');
        const { data: userData } = await supabaseAdmin.from('users').select('spin_tickets, last_daily_spin_at').eq('id', user.id).single();
        
        const today = new Date().toISOString().split('T')[0];
        const lastSpinDate = userData?.last_daily_spin_at ? userData.last_daily_spin_at.split('T')[0] : null;
        const canClaimDaily = lastSpinDate !== today;

        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                rewards: rewards || [], 
                tickets: userData?.spin_tickets || 0,
                canClaimDaily
            }) 
        };
    }

    // POST: Spin or Claim Daily
    if (event.httpMethod === 'POST') {
        const { action } = event.queryStringParameters || {};

        if (action === 'daily') {
            const { data: userData } = await supabaseAdmin.from('users').select('spin_tickets, last_daily_spin_at').eq('id', user.id).single();
            const today = new Date().toISOString().split('T')[0];
            const lastSpinDate = userData?.last_daily_spin_at ? userData.last_daily_spin_at.split('T')[0] : null;

            if (lastSpinDate === today) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Already claimed today.' }) };
            }

            await supabaseAdmin.from('users').update({ 
                spin_tickets: (userData?.spin_tickets || 0) + 1,
                last_daily_spin_at: new Date().toISOString()
            }).eq('id', user.id);

            return { statusCode: 200, body: JSON.stringify({ tickets: (userData?.spin_tickets || 0) + 1 }) };
        }

        // SPIN Logic
        const { data: userData } = await supabaseAdmin.from('users').select('spin_tickets, diamonds, xp').eq('id', user.id).single();
        if (!userData || userData.spin_tickets < 1) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Not enough tickets.' }) };
        }

        const { data: rewards } = await supabaseAdmin.from('lucky_wheel_rewards').select('*').eq('is_active', true).order('display_order');
        if (!rewards || rewards.length === 0) return { statusCode: 500, body: JSON.stringify({ error: 'No rewards configured.' }) };

        // Weighted Random Logic
        const totalWeight = rewards.reduce((acc, r) => acc + r.probability, 0);
        let random = Math.random() * totalWeight;
        let selectedReward = rewards[rewards.length - 1];
        let selectedIndex = rewards.length - 1;

        for (let i = 0; i < rewards.length; i++) {
            if (random < rewards[i].probability) {
                selectedReward = rewards[i];
                selectedIndex = i;
                break;
            }
            random -= rewards[i].probability;
        }

        // Apply Reward
        let newDiamonds = userData.diamonds;
        let newXp = userData.xp;
        let newTickets = userData.spin_tickets - 1;

        if (selectedReward.type === 'diamond') newDiamonds += selectedReward.amount;
        if (selectedReward.type === 'xp') newXp += selectedReward.amount;
        if (selectedReward.type === 'ticket') newTickets += selectedReward.amount;

        await Promise.all([
            supabaseAdmin.from('users').update({ 
                diamonds: newDiamonds, 
                xp: newXp, 
                spin_tickets: newTickets 
            }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: selectedReward.type === 'diamond' ? selectedReward.amount : 0,
                transaction_type: 'LUCKY_SPIN',
                description: `Quay trúng: ${selectedReward.label}`
            })
        ]);

        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                reward: selectedReward, 
                rewardIndex: selectedIndex, 
                remainingTickets: newTickets,
                newDiamondCount: newDiamonds,
                newXp: newXp
            }) 
        };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};

export { handler };
