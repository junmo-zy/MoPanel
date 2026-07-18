import { Check, Minus, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { useWallpaper } from "../wallpaper/useWallpaper";
import { BUILT_IN_WALLPAPERS } from "../wallpaper/wallpaper-store";

export function WallpaperSettings() {
  const wallpaper = useWallpaper();

  return (
    <section className="settings-section appearance-section" aria-labelledby="appearance-title">
      <div className="settings-section-title">
        <div>
          <h2 id="appearance-title">桌面与外观</h2>
          <p>选择内置风景，或者使用你自己的图片。</p>
        </div>
        <label className="button button-secondary compact-button wallpaper-upload" htmlFor="wallpaper-upload-input">
          <UploadSimple size={17} aria-hidden="true" />上传壁纸
        </label>
        <input
          id="wallpaper-upload-input"
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="上传自己的壁纸"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void wallpaper.uploadWallpaper(file);
            event.target.value = "";
          }}
        />
      </div>

      <div className="wallpaper-grid">
        {BUILT_IN_WALLPAPERS.map((item) => (
          <button
            type="button"
            className="wallpaper-option"
            key={item.id}
            aria-label={item.name}
            aria-pressed={wallpaper.selectedId === item.id}
            onClick={() => wallpaper.chooseWallpaper(item.id)}
          >
            <img src={item.url} alt="" />
            <span>{item.name}</span>
            {wallpaper.selectedId === item.id && <i><Check size={14} weight="bold" aria-hidden="true" /></i>}
          </button>
        ))}
        {wallpaper.customUrl && (
          <button
            type="button"
            className="wallpaper-option"
            aria-label="自定义壁纸"
            aria-pressed={wallpaper.selectedId === "custom"}
            onClick={() => wallpaper.chooseWallpaper("custom")}
          >
            <img src={wallpaper.customUrl} alt="" />
            <span>自定义壁纸</span>
            {wallpaper.selectedId === "custom" && <i><Check size={14} weight="bold" aria-hidden="true" /></i>}
          </button>
        )}
      </div>

      {wallpaper.error && <p className="wallpaper-error" role="alert">{wallpaper.error}</p>}

      <div className="appearance-controls">
        <div className="appearance-control">
          <span><strong>壁纸模糊度</strong><small>{wallpaper.blur}px</small></span>
          <div className="stepper">
            <button type="button" aria-label="减少壁纸模糊度" onClick={() => wallpaper.changeBlur(-2)}><Minus size={15} /></button>
            <span aria-hidden="true" />
            <button type="button" aria-label="增加壁纸模糊度" onClick={() => wallpaper.changeBlur(2)}><Plus size={15} /></button>
          </div>
        </div>
        <div className="appearance-control">
          <span><strong>背景遮罩</strong><small>{wallpaper.dim}%</small></span>
          <div className="stepper">
            <button type="button" aria-label="减少背景遮罩" onClick={() => wallpaper.changeDim(-4)}><Minus size={15} /></button>
            <span aria-hidden="true" />
            <button type="button" aria-label="增加背景遮罩" onClick={() => wallpaper.changeDim(4)}><Plus size={15} /></button>
          </div>
        </div>
        {wallpaper.customUrl && (
          <button type="button" className="remove-wallpaper" onClick={() => void wallpaper.removeCustomWallpaper()}>
            <Trash size={17} aria-hidden="true" />移除自定义壁纸
          </button>
        )}
      </div>
    </section>
  );
}
