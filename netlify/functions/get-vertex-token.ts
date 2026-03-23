import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  // Chỉ cho phép POST request
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    let service_account_json: string | undefined;

    // Nếu Frontend gửi trực tiếp JSON lên (để test)
    if (event.body) {
      const body = JSON.parse(event.body);
      if (body.service_account_json) {
        service_account_json = body.service_account_json;
      }
    }

    // Nếu không có JSON gửi lên, lấy từ Database
    if (!service_account_json) {
      const { data: credentialsList, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('status', 'active');

      if (error || !credentialsList || credentialsList.length === 0) {
        console.error("Supabase Error:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Không tìm thấy cấu hình GCP Credentials nào đang hoạt động trong Database.' })
        };
      }
      
      const validServiceAccounts = credentialsList.filter((row: any) => {
        const value = typeof row?.key_value === 'string' ? row.key_value : '';
        return value.includes('project_id') && value.includes('private_key') && value.includes('client_email');
      });

      if (validServiceAccounts.length === 0) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Không tìm thấy Service Account JSON hợp lệ trong bảng api_keys.' })
        };
      }

      // Pick a random active service account credential
      const randomIndex = Math.floor(Math.random() * validServiceAccounts.length);
      const credentials = validServiceAccounts[randomIndex];
      service_account_json = credentials.key_value;
    }

    if (!service_account_json || !service_account_json.includes('project_id')) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Nội dung không phải là file Service Account JSON hợp lệ.' })
      };
    }

    // 2. Parse JSON và tạo GoogleAuth client
    const credentialsObj = typeof service_account_json === 'string' 
      ? JSON.parse(service_account_json) 
      : service_account_json;

    const project_id = credentialsObj.project_id;

    const auth = new GoogleAuth({
      credentials: credentialsObj,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    // 3. Xin Access Token (Sống 1 tiếng)
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error("Không thể tạo Access Token từ Service Account cung cấp.");
    }

    // 4. Trả về Token và thông tin Project cho Frontend
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Cho phép CORS
      },
      body: JSON.stringify({
        accessToken: accessToken.token,
        projectId: project_id,
        location: 'global'
      })
    };

  } catch (error: any) {
    console.error("Token Generation Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
