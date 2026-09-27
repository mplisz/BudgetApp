// ============================================================
// File: src/components/panels/shoppingComponents/ListGroup.tsx
// One foldable group of the shopping list — an aisle on "Na już", a day
// on "Na termin". Same heading, same fold, whichever it is.
//
// Open by default: a group you did not collapse yourself is a shopping
// list that hides things. The caller keys it by the group's id so its
// open/closed state follows the group rather than its position.
// ============================================================

import { c } from "../../../styles/tokens";
import type { ReactNode } from "react";
import { CollapsibleSection } from "../../ui";
import { GROUP_SECTION } from "./layout";

interface ListGroupProps {
  icon:     string;
  label:    ReactNode;
  count:    number;
  /** Heading colour — a day that is close gets the warning tint. */
  color?:   string;
  children: ReactNode;
}

export function ListGroup({ icon, label, count, color, children }: ListGroupProps) {
  return (
    <CollapsibleSection
      title={
        <span style={{ fontSize: 11, letterSpacing: "0.7px", color }}>
          {icon} {label}
          <span style={{ color: c.textMuted, fontWeight: 400 }}> · {count}</span>
        </span>
      }
      style={GROUP_SECTION}
    >
      {children}
    </CollapsibleSection>
  );
}
