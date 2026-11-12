// Streaming / AI availability checks through the active proxy.
// Each check talks to the real service through Mihomo and returns
// { status: "yes" | "no" | "originals" | "failed", region?, detail? }.
// Sites change; every check fails soft ("failed" + reason) instead of guessing.

// Public Disney browser-client identifier, not a user's access token:
// https://github.com/lmc999/RegionRestrictionCheck/blob/main/check.sh

const DISNEY_BEARER = "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84";

// Regions where the service is not offered (used together with live signals).
const CLAUDE_BLOCKED = new Set(["CN", "HK", "MO", "RU", "BY", "IR", "KP", "SY", "CU", "VE", "AF", "MM", "SD", "SS", "ER", "LY", "SO", "YE", "CF", "CD"]);
const OPENAI_BLOCKED = new Set(["CN", "HK", "MO", "RU", "BY", "IR", "KP", "SY", "CU", "VE", "AF"]);

function json(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function blockedByChallenge(response) {
  return response.status === 403 && /cf-|cloudflare|Just a moment|captcha/i.test(response.text);
}

async function traceLocation(http, host) {
  const response = await http.request(`https://${host}/cdn-cgi/trace`);
  return response.text.match(/^loc=([A-Z]{2})$/m)?.[1];
}

async function bilibili(http, query) {
  const response = await http.request(`https://api.bilibili.com/pgc/player/web/playurl?${query}`);
  const code = json(response.text)?.code;
  if (code === 0) return { status: "yes" };
  if (code === -10403) return { status: "no" };
  return { status: "failed", detail: `返回码 ${code ?? response.status}` };
}

const checks = {
  "bilibili-cn": (http) => bilibili(http, "avid=82846771&qn=0&type=&otype=json&ep_id=307247&fourk=1&fnver=0&fnval=16&module=bangumi"),
  "bilibili-hkmotw": (http) => bilibili(http, "avid=18281381&cid=29892777&qn=0&type=&otype=json&ep_id=183799&fourk=1&fnver=0&fnval=16&module=bangumi"),

  async bahamut(http) {
    const device = await http.request("https://ani.gamer.com.tw/ajax/getdeviceid.php", { headers: { referer: "https://ani.gamer.com.tw/" } });
    if (blockedByChallenge(device)) return { status: "failed", detail: "被网站防护拦截（数据中心 IP 常见）" };
    const deviceId = json(device.text)?.deviceid;
    if (!deviceId) return { status: "failed", detail: `设备注册失败（${device.status}）` };
    const token = await http.request(`https://ani.gamer.com.tw/ajax/token.php?adID=89422&sn=37783&device=${encodeURIComponent(deviceId)}`, { headers: { referer: "https://ani.gamer.com.tw/" } });
    if (!token.text.includes("animeSn")) return { status: "no" };
    return { status: "yes", region: await traceLocation(http, "www.cloudflare.com").catch(() => undefined) };
  },

  async chatgpt(http) {
    const [compliance, region] = await Promise.all([
      http.request("https://api.openai.com/compliance/cookie_requirements", { headers: { authorization: "Bearer null" } }),
      traceLocation(http, "chat.openai.com").catch(() => undefined),
    ]);
    if (compliance.text.includes("unsupported_country")) return { status: "no", region };
    if (region && OPENAI_BLOCKED.has(region)) return { status: "no", region };
    if (compliance.status >= 500) return { status: "failed", detail: `OpenAI 返回 ${compliance.status}` };
    return { status: "yes", region };
  },

  async claude(http) {
    const [login, region] = await Promise.all([
      http.request("https://claude.ai/login", { redirect: "manual", readBody: false }),
      traceLocation(http, "claude.ai").catch(() => undefined),
    ]);
    const location = login.headers.get("location") || "";
    if (/unavailable|not-available/i.test(location)) return { status: "no", region };
    if (region && CLAUDE_BLOCKED.has(region)) return { status: "no", region };
    if (login.status >= 500) return { status: "failed", detail: `Claude 返回 ${login.status}` };
    return { status: "yes", region };
  },

  async disney(http) {
    const device = await http.request("https://disney.api.edge.bamgrid.com/devices", {
      method: "POST",
      headers: { authorization: `Bearer ${DISNEY_BEARER}`, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ deviceFamily: "browser", applicationRuntime: "chrome", deviceProfile: "windows", attributes: {} }),
    });
    const assertion = json(device.text)?.assertion;
    if (!assertion) return { status: device.status === 403 ? "no" : "failed", detail: `设备注册失败（${device.status}）` };
    const token = await http.request("https://disney.api.edge.bamgrid.com/token", {
      method: "POST",
      headers: { authorization: `Bearer ${DISNEY_BEARER}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        latitude: "0",
        longitude: "0",
        platform: "browser",
        subject_token: assertion,
        subject_token_type: "urn:bamtech:params:oauth:token-type:device",
      }).toString(),
    });
    if (token.text.includes("forbidden-location")) return { status: "no" };
    const refreshToken = json(token.text)?.refresh_token;
    if (!refreshToken) return { status: "failed", detail: `令牌交换失败（${token.status}）` };
    const graph = await http.request("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", {
      method: "POST",
      headers: { authorization: DISNEY_BEARER, "content-type": "application/json" },
      body: JSON.stringify({
        query: "mutation refreshToken($input: RefreshTokenInput!) { refreshToken(refreshToken: $input) { activeSession { sessionId } } }",
        variables: { input: { refreshToken } },
      }),
    });
    const session = json(graph.text)?.extensions?.sdk?.session;
    const region = session?.location?.countryCode;
    if (!session) return { status: "failed", detail: "无法读取地区" };
    return { status: session.inSupportedLocation ? "yes" : "no", region };
  },

  async gemini(http) {
    const response = await http.request("https://gemini.google.com/");
    const region = response.text.match(/,2,1,200,"([A-Z]{3})"/)?.[1];
    if (/\\?"45631641\\?":true|45631641,null,true/.test(response.text)) return { status: "yes", region };
    if (response.status === 200) return { status: "no", region };
    return { status: "failed", detail: `Gemini 返回 ${response.status}` };
  },

  async netflix(http) {
    // One licensed and one original title distinguish originals-only access:
    // regions serve the second but not the first.
    const [licensed, original] = await Promise.all([
      http.request("https://www.netflix.com/title/81280792", { readBody: false }),
      http.request("https://www.netflix.com/title/70143836", { readBody: false }),
    ]);
    if (licensed.status === 403 || original.status === 403) return { status: "no" };
    const region = (licensed.url.match(/netflix\.com\/([a-z]{2})(?:-[a-z]{2})?\/title/)?.[1] || "us").toUpperCase();
    if (licensed.status === 200) return { status: "yes", region };
    if (original.status === 200) return { status: "originals", region, detail: "仅自制剧" };
    if (licensed.status === 404 && original.status === 404) return { status: "no" };
    return { status: "failed", detail: `Netflix 返回 ${licensed.status}` };
  },

  async "prime-video"(http) {
    const response = await http.request("https://www.primevideo.com");
    if (response.text.includes("isServiceRestricted")) return { status: "no" };
    const region = response.text.match(/"currentTerritory":"([A-Z]{2})"/)?.[1];
    if (region) return { status: "yes", region };
    return { status: "failed", detail: `无法识别地区（${response.status}）` };
  },

  async spotify(http) {
    // Public probe identifiers from https://github.com/lmc999/RegionRestrictionCheck/blob/main/check.sh.
    const response = await http.request("https://spclient.wg.spotify.com/signup/public/v1/account", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "birth_day=11&birth_month=11&birth_year=2000&collect_personal_info=undefined&creation_flow=&creation_point=https%3A%2F%2Fwww.spotify.com%2Fhk-en%2F&displayname=Gay%20Lord&gender=male&iagree=1&key=a1e486e2729f46d6bb368d6b2bcda326&platform=www&referrer=&send-email=0&thirdpartyemail=0&identifier_token=AgE6YTvEzkReHNfJpO114514",
    });
    const data = json(response.text);
    if (data?.status === 311) return { status: "yes", region: String(data.country || data.launched_market || "").toUpperCase() || undefined };
    if (data?.status === 320) return { status: "no", detail: "检测到代理" };
    if (data?.status === 120) return { status: "no" };
    return { status: "failed", detail: `Spotify 返回 ${data?.status ?? response.status}` };
  },

  async tiktok(http) {
    const response = await http.request("https://www.tiktok.com/explore");
    const region = response.text.match(/"region":"(\w+)"/)?.[1];
    if (region) return { status: "yes", region };
    if (response.status === 403 || /\/about|unavailable/i.test(response.url)) return { status: "no" };
    return { status: "failed", detail: `无法识别地区（${response.status}）` };
  },

  async "youtube-premium"(http) {
    const response = await http.request("https://www.youtube.com/premium", {
      headers: { cookie: "CONSENT=YES+cb.20220301-11-p0.en+FX+700; PREF=hl=en" },
    });
    if (/google\.cn/.test(response.url)) return { status: "no", region: "CN" };
    const region = response.text.match(/"INNERTUBE_CONTEXT_GL":"([A-Z]{2})"/)?.[1]
      || response.text.match(/"countryCode":"([A-Z]{2})"/)?.[1];
    if (/Premium is not available in your country/i.test(response.text)) return { status: "no", region };
    if (region) return { status: "yes", region };
    return { status: "failed", detail: `无法识别地区（${response.status}）` };
  },
};

export const UNLOCK_SERVICES = [
  { id: "bilibili-cn", name: "哔哩哔哩大陆" },
  { id: "bilibili-hkmotw", name: "哔哩哔哩港澳台" },
  { id: "bahamut", name: "Bahamut Anime" },
  { id: "chatgpt", name: "ChatGPT Web" },
  { id: "claude", name: "Claude" },
  { id: "disney", name: "Disney+" },
  { id: "gemini", name: "Gemini" },
  { id: "netflix", name: "Netflix" },
  { id: "prime-video", name: "Prime Video" },
  { id: "spotify", name: "Spotify" },
  { id: "tiktok", name: "TikTok" },
  { id: "youtube-premium", name: "YouTube Premium" },
];

export async function runUnlockCheck(id, http) {
  const check = checks[id];
  if (!check) {
    const error = new Error("未知的检测项目");
    error.code = "UNKNOWN_UNLOCK_SERVICE";
    throw error;
  }
  return check(http);
}
