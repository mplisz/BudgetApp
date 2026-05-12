import { CategoriesSection } from "./settings/CategoriesSection";
import { TagsSection } from "./settings/TagsSection";
import { SettingsSection } from "./settings/SettingsSection";
import { theme as s } from "./../../styles/theme";

function PanelSettings() {
  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={s.sectionTitle}>Ustawienia</div>
      </div>
      <CategoriesSection />
      <TagsSection />
      <SettingsSection />
    </div>
  );
}

export default PanelSettings;