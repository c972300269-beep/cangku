const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/workbuddy/Claw/reports';
const BASE = 'xfk.linli580.cn';
const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';

let token = null;
let cookies = {};

function setCookies(headers) {
  const raw = headers['set-cookie'] || [];
  for (const c of raw) {
    const [kv] = c.split(';');
    const [k, ...v] = kv.split('=');
    if (k && v.length) cookies[k.trim()] = v.join('=').trim();
  }
}

function getCookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function request(method, urlPath, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, `https://${BASE}`);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...extraHeaders,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (Object.keys(cookies).length > 0) {
      headers['Cookie'] = getCookieHeader();
    }

    const options = {
      hostname: BASE,
      path: url.pathname + url.search,
      method,
      rejectUnauthorized: false,
      timeout: 30000,
      headers,
    };

    const req = https.request(options, (res) => {
      setCookies(res.headers);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          headers: res.headers, 
          body: data,
        });
      });
    });

    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

(async () => {
  try {
    // Step 1: Get initial cookies from login page
    console.log('[1] 获取初始Session...');
    const init = await request('GET', '/eacp/user/login');
    console.log(`  Status: ${init.status}, Cookies: ${Object.keys(cookies).length} 个`);

    // Step 2: OAuth2 Password Grant Login
    console.log('[2] OAuth2登录 (POST /api-uaa/oauth/user/token)...');
    
    const formBody = querystring.stringify({
      username: 'chenjialin3',
      password: 'chenjialin',
      grant_type: 'password',
      scope: 'all',
    });

    const loginResp = await request('POST', '/api-uaa/oauth/user/token', formBody, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ZWFjcDplYWNw', // common base64('eacp:eacp')
    });

    console.log(`  Status: ${loginResp.status}`);
    console.log(`  Preview: ${loginResp.body.substring(0, 300)}`);

    if (loginResp.status === 200) {
      try {
        const data = JSON.parse(loginResp.body);
        token = data.access_token || data.token;
        console.log(`  ✓ Token: ${token ? token.substring(0, 30) + '...' : 'NONE'}`);
      } catch (e) {
        console.log(`  Parse error: ${e.message}`);
      }
    }

    if (!token) {
      // Try without Basic auth header
      console.log('  重试(不带Basic Auth)...');
      const retry = await request('POST', '/api-uaa/oauth/user/token', formBody, {
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      console.log(`  Status: ${retry.status}, Preview: ${retry.body.substring(0, 300)}`);
      
      if (retry.status === 200) {
        const data = JSON.parse(retry.body);
        token = data.access_token || data.token;
        console.log(`  ✓ Token: ${token ? token.substring(0, 30) + '...' : 'NONE'}`);
      }
    }

    if (!token) {
      // Try JSON format instead of form
      console.log('  重试(JSON格式)...');
      const jsonRetry = await request('POST', '/api-uaa/oauth/user/token', JSON.stringify({
        username: 'chenjialin3',
        password: 'chenjialin',
        grant_type: 'password',
      }), {
        'Content-Type': 'application/json',
      });
      console.log(`  Status: ${jsonRetry.status}, Preview: ${jsonRetry.body.substring(0, 300)}`);
      
      if (jsonRetry.status === 200) {
        const data = JSON.parse(jsonRetry.body);
        token = data.access_token || data.token;
      }
    }

    if (token) {
      console.log(`\n  Token: ${token.substring(0, 40)}...`);
      
      // Step 3: Call budget API
      console.log('[3] 调用预算API...');
      const apiBody = JSON.stringify({
        Q_main: {
          PERIOD_S_EQ: 2026,
          ORG_ID_S_IN: ORGS,
          ACCOUNT_ID_S_EQ: '13403',
        },
        page: 0,
        size: 500,
      });

      const apiResp = await request('POST', '/api/api-budget/budget/view/detail/list', apiBody, {
        'Content-Type': 'application/json;charset=UTF-8',
      });

      console.log(`  Status: ${apiResp.status}`);
      console.log(`  Preview: ${apiResp.body.substring(0, 500)}`);

      if (apiResp.status === 200 && apiResp.body.length > 100) {
        const data = JSON.parse(apiResp.body);
        const rows = data.list || data.rows || data.data || data.records || [];
        
        const jsonPath = path.join(OUT, 'budget_live_data.json');
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        
        console.log(`\n✓ 成功! 总记录: ${data.total || rows.length}`);
        console.log(`  JSON: ${jsonPath}`);
        
        if (rows.length > 0) {
          console.log(`  首行: ${JSON.stringify(rows[0]).substring(0, 200)}`);
        }
      }
    } else {
      console.log('\n❌ 无法获取token');
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
})();
