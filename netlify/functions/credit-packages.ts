import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient.ts';

const handler: Handler = async () => {
    try {
        const { data, error } = await supabaseAdmin
            .from('credit_packages')
            .select('*')
            .eq('is_active', true)
            .order('price', { ascending: true });

        if (error) {
            throw error;
        }

        return {
            statusCode: 200,
            body: JSON.stringify(data),
        };
    } catch (error: any) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'Failed to fetch credit packages.' }),
        };
    }
};

export { handler };
