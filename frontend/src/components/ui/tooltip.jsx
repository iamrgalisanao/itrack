import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

// `outline-1`, not `border`. Two reasons applied when this was written and only
// one of them still does -- which is exactly why it is written down.
//
// The cascade reason is GONE: the unlayered `* { border-color }` that used to
// suppress every colour border utility now lives in @layer base, so a plain
// `border-popover-border` would work here today. dropdown-menu.jsx and
// select.jsx use precisely that.
//
// The forced-colors reason REMAINS, and it is the load-bearing one. A tooltip
// floats over arbitrary content, so its boundary is the only thing separating
// it from whatever is behind. `ring` is pure box-shadow and forced-colors mode
// forces `box-shadow: none`; an outline survives, with the UA repainting
// outline-color as a system colour. A border would survive too -- but outline
// does not participate in layout, which matters for a node positioned by Radix.
//
// So do NOT "unify" this to a border for consistency with the two menus above.
// They are anchored panels; this is not.
const TooltipContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md outline-1 outline-popover-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }