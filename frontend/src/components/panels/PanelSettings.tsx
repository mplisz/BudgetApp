// ============================================================
// File: frontend/src/components/panels/PanelSettings.jsx
// ============================================================

import { CategoriesSection }     from "./settings/CategoriesSection";
import { TagsSection }           from "./settings/TagsSection";
import { SettingsSection }       from "./settings/SettingsSection";
import { CurrenciesSection }     from "./settings/CurrenciesSection";
import { theme as s }            from "./../../styles/theme";
import { LuxmedSection }         from  "./settings/LuxmedSection";
import { DepositSection }        from  "./settings/DepositSection";

function PanelSettings() {
  return (
    <div style={{ ...s.panel, maxWidth: 900 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={s.sectionTitle}>Ustawienia</div>
      </div>
      <CategoriesSection />
      <CurrenciesSection />
      <TagsSection />
      <LuxmedSection />
      <DepositSection />
      <SettingsSection />
    </div>
  );
}

export default PanelSettings;