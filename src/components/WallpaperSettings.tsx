import { ArrowCounterClockwise, Check, Trash, UploadSimple, X } from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import { useWallpaper } from "../wallpaper/useWallpaper";
import { BUILT_IN_WALLPAPERS } from "../wallpaper/wallpaper-store";
import { GLASS_LEVELS, WALLPAPER_LIMITS } from "../wallpaper/wallpaper-preferences";

interface SliderProps {
  label: string;
  hint: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function AppearanceSlider({ label, hint, value, unit, min, max, step, onChange }: SliderProps) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <label className="appearance-slider">
      <span className="appearance-slider-head">
        <strong>{label}</strong>
        <span className="slider-value">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ "--fill": `${percent}%` } as React.CSSProperties}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
      />
      <small>{hint}</small>
    </label>
  );
}

export function WallpaperSettings() {
  const wallpaper = useWallpaper();
  const visible = BUILT_IN_WALLPAPERS.filter((item) => !wallpaper.hidden.includes(item.id));
  const canHide = visible.length > 1 || Boolean(wallpaper.customUrl);

  return (
    <section className="settings-section appearance-section" aria-labelledby="appearance-title">
      <div className="settings-section-title">
        <div>
          <h2 id="appearance-title">桌面与外观</h2>
          <p>选择壁纸，调整玻璃的通透感。设置会同步到所有打开面板的设备（浅色/深色各浏览器单独记忆）。</p>
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
        {visible.map((item) => (
          <div className="wallpaper-tile" key={item.id}>
            <button
              type="button"
              className="wallpaper-option"
              aria-label={item.name}
              aria-pressed={wallpaper.selectedId === item.id}
              onClick={() => wallpaper.chooseWallpaper(item.id)}
            >
              <img src={item.url} alt="" />
              <span>{item.name}</span>
              {wallpaper.selectedId === item.id && <i><Check size={14} weight="bold" aria-hidden="true" /></i>}
            </button>
            <button
              type="button"
              className="wallpaper-remove"
              aria-label={`移除 ${item.name}`}
              data-tip={canHide ? "从壁纸列表移除（可随时恢复）" : "至少保留一张壁纸"}
              disabled={!canHide}
              onClick={() => wallpaper.hideWallpaper(item.id)}
            >
              <X size={13} weight="bold" aria-hidden="true" />
            </button>
          </div>
        ))}
        {wallpaper.customUrl && (
          <div className="wallpaper-tile">
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
            <button
              type="button"
              className="wallpaper-remove"
              aria-label="删除自定义壁纸"
              data-tip={visible.length > 0 ? "删除上传的壁纸" : "至少保留一张壁纸"}
              disabled={visible.length === 0}
              onClick={() => void wallpaper.removeCustomWallpaper()}
            >
              <Trash size={13} weight="bold" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {wallpaper.hidden.length > 0 && (
        <button type="button" className="text-button wallpaper-restore" onClick={wallpaper.restoreWallpapers}>
          <ArrowCounterClockwise size={15} aria-hidden="true" />恢复已移除的预设壁纸（{wallpaper.hidden.length}）
        </button>
      )}

      {wallpaper.error && <p className="wallpaper-error" role="alert">{wallpaper.error}</p>}

      <div className="appearance-sliders">
        <AppearanceSlider
          label="壁纸模糊度"
          hint="模糊壁纸本身；0 为原图清晰"
          value={wallpaper.blur}
          unit="px"
          min={WALLPAPER_LIMITS.blur.min}
          max={WALLPAPER_LIMITS.blur.max}
          step={1}
          onChange={wallpaper.setBlur}
        />
        <AppearanceSlider
          label="背景遮罩"
          hint="深色模式压暗、浅色模式提亮壁纸，让文字更清楚"
          value={wallpaper.dim}
          unit="%"
          min={WALLPAPER_LIMITS.dim.min}
          max={WALLPAPER_LIMITS.dim.max}
          step={1}
          onChange={wallpaper.setDim}
        />
        <div className="appearance-slider material-picker">
          <span className="appearance-slider-head">
            <strong id="glass-level-label">玻璃材质</strong>
            <span className="slider-value">{GLASS_LEVELS.find((level) => level.value === wallpaper.glass)?.label}</span>
          </span>
          <div className="segmented-control material-levels" role="radiogroup" aria-labelledby="glass-level-label">
            {GLASS_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                role="radio"
                aria-checked={wallpaper.glass === level.value}
                aria-pressed={wallpaper.glass === level.value}
                data-tip={level.hint}
                onClick={() => wallpaper.setGlass(level.value)}
              >{level.label}</button>
            ))}
          </div>
          <small>从清透到柔和，调整玻璃厚度；降低壁纸模糊度能看清边缘折射。</small>
        </div>
      </div>
      <button type="button" className="text-button" onClick={wallpaper.resetAppearance}>
        <ArrowCounterClockwise size={15} aria-hidden="true" />恢复默认效果
      </button>
    </section>
  );
}
