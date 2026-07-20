// ============================================================
// File: frontend/src/components/panels/PanelSettings.jsx
// ============================================================

import { CategoriesSection }     from "./settings/CategoriesSection";
import { TagsSection }           from "./settings/TagsSection";
import { SettingsSection }       from "./settings/SettingsSection";
import { CurrenciesSection }     from "./settings/CurrenciesSection";
import { theme as s }            from "./../../styles/theme";
import { LuxmedSection }         from  "./settings/LuxmedSection";
import { CategoryMappingSection } from  "./settings/CategoryMappingSection";
import { TrackedProductsSection } from "./settings/TrackedProductsSection";

function PanelSettings() {
  return (
    <div style={{ ...s.panel, maxWidth: 1200 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={s.sectionTitle}>Ustawienia</div>
      </div>
      <CategoriesSection />
      <CurrenciesSection />
      <TagsSection />
      <LuxmedSection />
      <CategoryMappingSection />
      <TrackedProductsSection />
      <SettingsSection />
    </div>
  );
}

export default PanelSettings;