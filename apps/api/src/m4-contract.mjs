export const M4_REPLAY_RESOURCE = "ui://promptchien/replay-viewer/v1.html";
export const M4_GAME_RESOURCE = "ui://promptchien/game/v6.html";
export const M4_REPLAY_MIME = "text/html;profile=mcp-app";

export const M4_REPLAY_RESOURCE_META = {
  ui: { prefersBorder: false },
  "openai/widgetDescription": "Interactive PROMPT Chiến replay viewer with play, pause, seek and damage heatmap controls.",
  "openai/widgetPrefersBorder": false,
};

export const M4_GAME_RESOURCE_META = {
  ui: {
    prefersBorder: false,
    domain: "https://api.kythuatvang.com",
    csp: {
      connectDomains: ["https://api.kythuatvang.com"],
      resourceDomains: ["https://api.kythuatvang.com", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    },
  },
  "openai/widgetDescription": "PROMPT Chien bot editor, inspector, sandbox and queue inside ChatGPT.",
  "openai/widgetPrefersBorder": false,
  "openai/widgetDomain": "https://api.kythuatvang.com",
  "openai/widgetCSP": {
    connect_domains: ["https://api.kythuatvang.com"],
    resource_domains: ["https://api.kythuatvang.com", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
  },
};
