import { type AddressBarPlace, useAddressBarStore } from "../../browser/rome/addressBarStore";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const PLACE_LABELS: Record<AddressBarPlace, string> = {
  page: "Above the page",
  sidebar: "In the sidebar",
};

/** How the browser's pages are framed: where their address and controls sit. */
export function BrowserAppearanceSection() {
  const place = useAddressBarStore((state) => state.place);
  const setPlace = useAddressBarStore((state) => state.setPlace);
  return (
    <SettingsSection id="browser-appearance" title="Browser">
      <SettingsRow
        {...searchableSetting("address-bar")}
        description="Show a page's address, back, forward and reload above the page, or in the sidebar under the space as Arc does. Right-click the controls to switch."
        resetAction={
          place !== "page" ? (
            <SettingResetButton label="address bar" onClick={() => setPlace("page")} />
          ) : null
        }
        control={
          <div className="w-full sm:w-40">
            <Select
              value={place}
              onValueChange={(value) => {
                if (value === "page" || value === "sidebar") setPlace(value);
              }}
            >
              <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Address bar">
                <SelectValue>{PLACE_LABELS[place]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="page">Above the page (default)</SelectItem>
                <SelectItem value="sidebar">In the sidebar</SelectItem>
              </SelectPopup>
            </Select>
          </div>
        }
      />
    </SettingsSection>
  );
}
