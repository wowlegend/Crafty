import { BLOCK_TYPES } from '../../world/Blocks';
import { Icon } from '../primitives/index.js';
import { getItemIcon } from '../../data/items.js';

// ItemIcon (S3 de-monolith from GamePanels): the shared item/block glyph used by Inventory AND
// CraftingTable -> a leaf module both import (avoids a GamePanels<->CraftingTable circular import).
export const ItemIcon = ({ itemName, size = 42 }) => {
    const icon = getItemIcon(itemName);
    if (icon) return <Icon name={icon} size={size} />;
    const swatch = Math.round(size * 0.62);
    const blockColor = BLOCK_TYPES[itemName]?.color;
    return (
        <div
            className="rounded-sm grid place-items-center border-chrome border-ink"
            style={{ width: swatch, height: swatch, backgroundColor: blockColor || 'rgb(var(--ui-slot))' }}
            title={itemName}
        />
    );
};
