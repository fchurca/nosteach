import { defineConfig } from 'vite';
import http from 'http';
import https from 'https';

const LNURLP_PROVIDERS = {
  'getalby': {
    host: 'getalby.com',
    path: '/hello/verify/'
  },
  'lnurlsocial': {
    host: 'lnurl.social',
    path: '/verify/'
  }
};

const verifyProxyPlugin = () => ({
  name: 'verify-proxy',
  configureServer(server) {
    server.middlewares.use('/api/verify', (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const hash = url.searchParams.get('hash');
      const provider = url.searchParams.get('provider') || 'getalby';
      
      if (!hash) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing hash parameter' }));
        return;
      }
      
      if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid hash format' }));
        return;
      }
      
      const providerConfig = LNURLP_PROVIDERS[provider];
      if (!providerConfig) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unknown provider: ' + provider }));
        return;
      }
      
      const targetUrl = `https://${providerConfig.host}${providerConfig.path}${hash}`;
      console.log('[verify-proxy] Forwarding to:', targetUrl);
      
      const options = {
        hostname: providerConfig.host,
        port: 443,
        path: providerConfig.path + hash,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NosTeach/1.0'
        }
      };
      
      const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
      });
      
      proxyReq.on('error', (e) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: e.message }));
      });
      
      proxyReq.end();
    });
  }
});

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist'
  },
  plugins: [verifyProxyPlugin()]
});
