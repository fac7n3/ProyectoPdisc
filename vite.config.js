import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { buildSitemapXml, withSitemapLine, resolveOrigin, fetchSitemapRows } from './scripts/sitemap.mjs';

// Plugin to inject standard security headers in dev server
function securityHeadersPlugin() {
  return {
    name: 'security-headers',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        // geolocation=(self): el home la usa (mapa "Comercios cerca tuyo").
        // camera/microphone siguen sin uso en el sitio, quedan bloqueadas.
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
        next();
      });
    },
  };
}

// Escribe dist/sitemap.xml y la línea "Sitemap:" de dist/robots.txt al terminar
// el build (ver scripts/sitemap.mjs). Si la base no responde, sale con las
// páginas fijas y el build sigue.
function sitemapPlugin() {
  let outDir;
  let env;
  return {
    name: 'sitemap',
    apply: 'build',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
      env = loadEnv(cfg.mode, cfg.root, 'VITE_');
    },
    async closeBundle() {
      const origin = resolveOrigin(process.env);
      const rows = await fetchSitemapRows({ supabaseUrl: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY });
      writeFileSync(resolve(outDir, 'sitemap.xml'), buildSitemapXml(origin, rows));
      const robotsPath = resolve(outDir, 'robots.txt');
      const robots = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : 'User-agent: *\nAllow: /\n';
      writeFileSync(robotsPath, withSitemapLine(robots, origin));
      console.log(`[sitemap] ${origin}/sitemap.xml: ${rows.stores.length} comercios, ${rows.products.length} productos`);
    },
  };
}

export default defineConfig({
  plugins: [securityHeadersPlugin(), sitemapPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        home: resolve(__dirname, 'pages/home.html'),
        login: resolve(__dirname, 'pages/login.html'),
        register: resolve(__dirname, 'pages/register.html'),
        recuperarPassword: resolve(__dirname, 'pages/recuperar-password.html'),
        nuevaContrasena: resolve(__dirname, 'pages/nueva-contrasena.html'),
        perfil: resolve(__dirname, 'pages/perfil.html'),
        carrito: resolve(__dirname, 'pages/carrito.html'),
        search: resolve(__dirname, 'pages/search.html'),
        comercios: resolve(__dirname, 'pages/comercios.html'),
        vender: resolve(__dirname, 'pages/vender.html'),
        admin: resolve(__dirname, 'pages/admin.html'),
        producto: resolve(__dirname, 'pages/producto.html'),
        comercio: resolve(__dirname, 'pages/comercio.html'),
        terminos: resolve(__dirname, 'pages/terminos.html'),
        privacidad: resolve(__dirname, 'pages/privacidad.html'),
        info: resolve(__dirname, 'pages/info.html'),
        farmacias: resolve(__dirname, 'pages/farmacias.html'),
        contratar: resolve(__dirname, 'pages/contratar.html'),
        profesional: resolve(__dirname, 'pages/profesional.html'),
        servicios: resolve(__dirname, 'pages/servicios.html'),
        repartidor: resolve(__dirname, 'pages/repartidor.html'),
      }
    }
  }
});
