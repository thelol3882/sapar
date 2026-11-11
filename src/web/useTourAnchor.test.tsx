import { render } from '@testing-library/react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineAnchors } from '../core';
import type { AnchorKey } from '../core';
import { getAnchorElement } from './registry';
import { useTourAnchor } from './useTourAnchor';

const ANCHORS = defineAnchors(['billing.upgrade', 'nav.help']);
type HostAnchorKey = AnchorKey<typeof ANCHORS>;

function useHostAnchor<E extends HTMLElement = HTMLElement>(key: HostAnchorKey) {
    return useTourAnchor<HostAnchorKey, E>(key);
}

function Anchored({ anchorKey }: { anchorKey: HostAnchorKey }) {
    return <button {...useHostAnchor<HTMLButtonElement>(anchorKey)}>Upgrade</button>;
}

describe('useTourAnchor', () => {
    it('registers the element and renders the data-sapar attribute', () => {
        const { getByRole } = render(<Anchored anchorKey="billing.upgrade" />);

        const button = getByRole('button');
        expect(button).toHaveAttribute('data-sapar', 'billing.upgrade');
        expect(getAnchorElement('billing.upgrade')).toBe(button);
    });

    it('unregisters on unmount', () => {
        const { unmount } = render(<Anchored anchorKey="billing.upgrade" />);
        unmount();
        expect(getAnchorElement('billing.upgrade')).toBeNull();
    });

    it('moves the registration when the key changes', () => {
        const { getByRole, rerender } = render(<Anchored anchorKey="billing.upgrade" />);
        rerender(<Anchored anchorKey="nav.help" />);

        const button = getByRole('button');
        expect(getAnchorElement('nav.help')).toBe(button);
        expect(document.querySelector('[data-sapar="billing.upgrade"]')).toBeNull();
        expect(getAnchorElement('billing.upgrade')).toBeNull();
    });

    it('keeps host anchor keys typed', () => {
        expectTypeOf(useHostAnchor).parameter(0).toEqualTypeOf<HostAnchorKey>();
        expectTypeOf<ReturnType<typeof useTourAnchor<'x.y'>>>().toHaveProperty('data-sapar').toEqualTypeOf<'x.y'>();
        expectTypeOf(useTourAnchor).parameter(0).toEqualTypeOf<string>();
    });
});
