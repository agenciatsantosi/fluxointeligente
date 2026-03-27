// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Users/Thiago%20Santosi/Desktop/Projetos/Auto_postagem/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Thiago%20Santosi/Desktop/Projetos/Auto_postagem/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    define: {
      // Polyfill process.env to avoid "ReferenceError: process is not defined" in the browser
      // and inject API_KEY if available.
      "process.env": {
        API_KEY: env.API_KEY || ""
      }
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          secure: false
        },
        "/uploads": {
          target: "http://localhost:3001",
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxUaGlhZ28gU2FudG9zaVxcXFxEZXNrdG9wXFxcXFByb2pldG9zXFxcXEF1dG9fcG9zdGFnZW1cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXFRoaWFnbyBTYW50b3NpXFxcXERlc2t0b3BcXFxcUHJvamV0b3NcXFxcQXV0b19wb3N0YWdlbVxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvVGhpYWdvJTIwU2FudG9zaS9EZXNrdG9wL1Byb2pldG9zL0F1dG9fcG9zdGFnZW0vdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICAvLyBMb2FkIGVudiBmaWxlIGJhc2VkIG9uIGBtb2RlYCBpbiB0aGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeS5cbiAgLy8gU2V0IHRoZSB0aGlyZCBwYXJhbWV0ZXIgdG8gJycgdG8gbG9hZCBhbGwgZW52IHJlZ2FyZGxlc3Mgb2YgdGhlIGBWSVRFX2AgcHJlZml4LlxuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIChwcm9jZXNzIGFzIGFueSkuY3dkKCksICcnKTtcblxuICByZXR1cm4ge1xuICAgIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgICBkZWZpbmU6IHtcbiAgICAgIC8vIFBvbHlmaWxsIHByb2Nlc3MuZW52IHRvIGF2b2lkIFwiUmVmZXJlbmNlRXJyb3I6IHByb2Nlc3MgaXMgbm90IGRlZmluZWRcIiBpbiB0aGUgYnJvd3NlclxuICAgICAgLy8gYW5kIGluamVjdCBBUElfS0VZIGlmIGF2YWlsYWJsZS5cbiAgICAgICdwcm9jZXNzLmVudic6IHtcbiAgICAgICAgQVBJX0tFWTogZW52LkFQSV9LRVkgfHwgJydcbiAgICAgIH1cbiAgICB9LFxuICAgIHNlcnZlcjoge1xuICAgICAgcG9ydDogNTE3MyxcbiAgICAgIGhvc3Q6IHRydWUsXG4gICAgICBhbGxvd2VkSG9zdHM6IHRydWUsXG4gICAgICBwcm94eToge1xuICAgICAgICAnL2FwaSc6IHtcbiAgICAgICAgICB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnLFxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgICBzZWN1cmU6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgICcvdXBsb2Fkcyc6IHtcbiAgICAgICAgICB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnLFxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgICBzZWN1cmU6IGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFrVyxTQUFTLGNBQWMsZUFBZTtBQUN4WSxPQUFPLFdBQVc7QUFHbEIsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQU07QUFHeEMsUUFBTSxNQUFNLFFBQVEsTUFBTyxRQUFnQixJQUFJLEdBQUcsRUFBRTtBQUVwRCxTQUFPO0FBQUEsSUFDTCxTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDakIsUUFBUTtBQUFBO0FBQUE7QUFBQSxNQUdOLGVBQWU7QUFBQSxRQUNiLFNBQVMsSUFBSSxXQUFXO0FBQUEsTUFDMUI7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixjQUFjO0FBQUEsTUFDZCxPQUFPO0FBQUEsUUFDTCxRQUFRO0FBQUEsVUFDTixRQUFRO0FBQUEsVUFDUixjQUFjO0FBQUEsVUFDZCxRQUFRO0FBQUEsUUFDVjtBQUFBLFFBQ0EsWUFBWTtBQUFBLFVBQ1YsUUFBUTtBQUFBLFVBQ1IsY0FBYztBQUFBLFVBQ2QsUUFBUTtBQUFBLFFBQ1Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
