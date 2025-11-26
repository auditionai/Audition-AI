
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    const headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    };

    // PUBLIC: GET request to fetch active packages
    if (event.httpMethod === 'GET' && !event.headers['authorization']) {
        const { featured } = event.queryStringParameters || {};
        
        try {
            // 1. Fetch Packages
            let query = supabaseAdmin
                .from('credit_packages')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (featured === 'true') {
                query = query.eq('is_featured', true);
            }

            const { data: packages, error: pkgError } = await query;
            if (pkgError) throw pkgError;

            // 2. Check for Active Promotion
            const now = new Date().toISOString();
            const { data: activePromo } = await supabaseAdmin
                .from('promotions')
                .select('bonus_percentage')
                .eq('is_active', true)
                .lte('start_time', now)
                .gte('end_time', now)
                .limit(1)
                .maybeSingle();

            // 3. Calculate dynamic bonuses
            const enhancedPackages = packages.map((pkg: any) => {
                let promoBonus = 0;
                let promoPercent = 0;

                if (activePromo) {
                    promoPercent = activePromo.bonus_percentage;
                    // Bonus calculated on base amount (pkg.credits_amount)
                    promoBonus = Math.floor(pkg.credits_amount * (promoPercent / 100));
                }

                return {
                    ...pkg,
                    promo_bonus_credits: promoBonus,
                    promo_percent: promoPercent
                };
            });

            return { 
                statusCode: 200, 
                headers,
                body: JSON.stringify(enhancedPackages) 
            };

        } catch (error: any) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
        }
    }

    // ADMIN: All other requests require admin authentication (UNCHANGED BELOW)
    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    }
    const token = authHeader.split(' ')[1];
    // FIX: Use Supabase v2 `auth.getUser` by casting to any
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);

    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };
    }

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }
    
    switch (event.httpMethod) {
        case 'GET': // Admin GET can include inactive packages
            const { data: allData, error: getAllError } = await supabaseAdmin
                .from('credit_packages')
                .select('*')
                .order('display_order', { ascending: true });
            if (getAllError) return { statusCode: 500, body: JSON.stringify({ error: getAllError.message }) };
            return { statusCode: 200, body: JSON.stringify(allData) };

        case 'POST':
            const newPkg = JSON.parse(event.body || '{}');
            const { data: addedPkg, error: postError } = await supabaseAdmin
                .from('credit_packages')
                .insert(newPkg)
                .select()
                .single();
            if (postError) return { statusCode: 500, body: JSON.stringify({ error: postError.message }) };
            return { statusCode: 201, body: JSON.stringify(addedPkg) };

        case 'PUT':
            const { id, ...updates } = JSON.parse(event.body || '{}');
            const { data: updatedPkg, error: putError } = await supabaseAdmin
                .from('credit_packages')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (putError) return { statusCode: 500, body: JSON.stringify({ error: putError.message }) };
            return { statusCode: 200, body: JSON.stringify(updatedPkg) };
        
        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };
