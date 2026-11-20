const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const OUT = 'E:/workbuddy/Claw/reports';
const BASE = 'xfk.linli580.cn';
const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';

// Cookie jar
let cookies = {};

function setCookies(headers) {
  const raw = headers['set-cookie'] || [];
  for (const c of raw) {
    const parts = c.split(';')[0].split('=');
    if (parts.length >= 2) cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
}

function getCookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function request(method, urlPath, body = null, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, `https://${BASE}`);
    const options = {
      hostname: BASE,
      path: url.pathname + url.search,
      method,
      rejectUnauthorized: false,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...opts.headers,
      },
    };

    if (Object.keys(cookies).length > 0) {
      options.headers['Cookie'] = getCookieHeader();
    }

    if (body) {
      const str = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json;charset=UTF-8';
      options.headers['Content-Length'] = Buffer.byteLength(str);
    }

    const req = https.request(options, (res) => {
      setCookies(res.headers);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          headers: res.headers, 
          body: data,
          location: res.headers.location,
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
    // Step 1: Get login page (extract CSRF if needed)
    console.log('[1] 获取登录页...');
    const loginPage = await request('GET', '/eacp/user/login');
    console.log(`  Status: ${loginPage.status}, Size: ${loginPage.body.length}`);

    // Step 2: Login
    console.log('[2] 登录...');
    const loginResult = await request('POST', '/eacp/user/login', {
      username: 'chenjialin3',
      password: 'chenjialin',
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: undefined, // Will be set below
    });

    // Actually, let's use URL-encoded form data for login
    // Re-do login with proper form encoding
    const qs = require('querystring');
    const loginBody = qs.stringify({
      username: 'chenjialin3',
      password: 'chenjialin',
    });

    const loginResult2 = await new Promise((resolve, reject) => {
      const options = {
        hostname: BASE,
        path: '/eacp/user/login',
        method: 'POST',
        rejectUnauthorized: false,
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(loginBody),
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Cookie': getCookieHeader(),
        },
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
            location: res.headers.location,
          });
        });
      });
      req.on('error', e => reject(e));
      req.write(loginBody);
      req.end();
    });

    console.log(`  Status: ${loginResult2.status}`);
    console.log(`  Location: ${loginResult2.location || 'none'}`);
    console.log(`  Cookies: ${Object.keys(cookies).length} 个`);
    
    if (loginResult2.location) {
      // Follow redirect
      console.log(`  跟随重定向...`);
      const redirect = await request('GET', loginResult2.location);
      console.log(`  Redirect status: ${redirect.status}`);
    }

    // Step 3: Navigate to budget page
    console.log('[3] 进入预算页面...');
    const budgetPage = await request('GET', '/eacp/budget/home/budget_view/BudgetViewDetail');
    console.log(`  Status: ${budgetPage.status}, Size: ${budgetPage.body.length}`);
    
    if (budgetPage.body.includes('登录') || budgetPage.body.includes('login')) {
      console.log('  ❌ 可能需要CSRF token登录, 尝试带token...');
      
      // Extract CSRF from login page
      const csrfMatch = loginPage.body.match(/name="_csrf"[^>]*value="([^"]+)"/) || 
                        loginPage.body.match(/csrf[^=]*=\s*['"]([^'"]+)['"]/i);
      
      if (csrfMatch) {
        const csrf = csrfMatch[1];
        console.log(`  CSRF: ${csrf}`);
        
        // Retry login with CSRF
        const loginWithCsrf = qs.stringify({
          username: 'chenjialin3',
          password: 'chenjialin',
          _csrf: csrf,
        });
        
        const retryLogin = await new Promise((resolve, reject) => {
          const options = {
            hostname: BASE, path: '/eacp/user/login', method: 'POST',
            rejectUnauthorized: false, timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(loginWithCsrf),
              'Cookie': getCookieHeader(),
            },
          };
          const req = https.request(options, (res) => {
            setCookies(res.headers);
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body: data }));
          });
          req.on('error', e => reject(e));
          req.write(loginWithCsrf);
          req.end();
        });
        
        console.log(`  Retry: status=${retryLogin.status}, location=${retryLogin.location || 'none'}`);
        if (retryLogin.location) {
          await request('GET', retryLogin.location);
        }
      }
    }

    // Step 4: Call the budget API
    console.log('[4] 调用预算API...');
    const apiResult = await request('POST', '/api/api-budget/budget/view/detail/list', {
      Q_main: {
        PERIOD_S_EQ: 2026,
        ORG_ID_S_IN: ORGS,
        ACCOUNT_ID_S_EQ: '13403',
      },
      page: 0,
      size: 500,
    });
    
    console.log(`  Status: ${apiResult.status}`);
    console.log(`  Preview: ${apiResult.body.substring(0, 300)}`);

    if (apiResult.status === 200 && apiResult.body.length > 100) {
      const data = JSON.parse(apiResult.body);
      const rows = data.list || data.rows || data.data || data.records || [];
      console.log(`\n✓ 成功! 总记录: ${data.total || rows.length}, 返回行: ${rows.length}`);
      
      const jsonPath = path.join(OUT, 'budget_live_data.json');
      fs.writeFileSync(jsonPath, apiResult.body);
      console.log(`  JSON: ${jsonPath}`);
      
      if (rows.length > 0) {
        console.log(`  首行列: ${Object.keys(rows[0]).join(', ')}`);
        console.log(`  首行数据: ${JSON.stringify(rows[0]).substring(0, 200)}`);
      }
    } else if (apiResult.status === 401) {
      console.log('  ❌ 401 - 认证失败');
      console.log(`  Cookies at API call: ${Object.keys(cookies).join(', ')}`);
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
})();
