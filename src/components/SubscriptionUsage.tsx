import { useState } from "react";
import type { SubscriptionInfo } from "../api/types";
import { formatTraffic } from "../format";

// Used / total traffic bar plus expiry, from Mihomo's subscriptionInfo.
export function SubscriptionUsage({ info }: { info: SubscriptionInfo }) {
  const used = info.upload + info.download;
  const ratio = info.total > 0 ? Math.min(1, used / info.total) : 0;
  const expireDate = info.expire > 0 ? new Date(info.expire * 1000) : null;
  const [now] = useState(() => Date.now());
  const expired = expireDate ? expireDate.getTime() < now : false;
  const tone = expired || ratio >= 0.9 ? "danger" : ratio >= 0.75 ? "warning" : "normal";
  return (
    <span className="subscription-usage" data-tone={tone}>
      {info.total > 0 && (
        <span className="subscription-usage-bar" role="meter" aria-label="已用流量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
          <i style={{ width: `${Math.max(ratio * 100, 2)}%` }} />
        </span>
      )}
      <span className="subscription-usage-text">
        <span>{info.total > 0 ? `${formatTraffic(used)} / ${formatTraffic(info.total)}` : `已用 ${formatTraffic(used)}`}</span>
        <span>{expireDate ? `${expired ? "已于" : "到期"} ${expireDate.toLocaleDateString("zh-CN")}${expired ? " 过期" : ""}` : "长期有效"}</span>
      </span>
    </span>
  );
}
