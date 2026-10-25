import { XIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Closes a chat opened beside another; it stays in the sidebar. */
export function ClosePaneButton(props: { readonly onClose: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label="Close pane"
            onClick={props.onClose}
          />
        }
      >
        <XIcon />
      </TooltipTrigger>
      <TooltipPopup side="bottom">Close pane</TooltipPopup>
    </Tooltip>
  );
}
