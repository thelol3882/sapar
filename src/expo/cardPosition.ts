import type { AnchorRect, Placement } from '../core';

export interface Size {
    width: number;
    height: number;
}

export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

type Side = Exclude<Placement, 'auto'>;

export interface CardPositionInput {
    /** Null centers the card in the window. */
    anchor: AnchorRect | null;
    card: Size;
    window: Size;
    placement: Placement;
    /** Gap between the anchor and the card. */
    offset: number;
    /** Space the card must keep clear at each window edge. */
    insets: Insets;
}

type Point = Pick<CardPosition, 'x' | 'y'>;

export interface CardPosition {
    x: number;
    y: number;
    /** False when neither the preferred side of the anchor nor the opposite one has room for the card. */
    fits: boolean;
}

const OPPOSITE_SIDE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

function spaceOnSide(side: Side, { anchor, window, insets, offset }: CardPositionInput & { anchor: AnchorRect }): number {
    switch (side) {
        case 'bottom':
            return window.height - insets.bottom - (anchor.y + anchor.height) - offset;
        case 'top':
            return anchor.y - insets.top - offset;
        case 'right':
            return window.width - insets.right - (anchor.x + anchor.width) - offset;
        case 'left':
            return anchor.x - insets.left - offset;
    }
}

const preferredSide = (placement: Placement): Side => (placement === 'auto' ? 'bottom' : placement);

function findSideWithRoom(input: CardPositionInput & { anchor: AnchorRect }): Side | null {
    const preferred = preferredSide(input.placement);
    const needed = preferred === 'top' || preferred === 'bottom' ? input.card.height : input.card.width;
    const hasRoom = (side: Side): boolean => spaceOnSide(side, input) >= needed;
    return [preferred, OPPOSITE_SIDE[preferred]].find(hasRoom) ?? null;
}

function positionBesideAnchor(side: Side, { anchor, card, offset }: CardPositionInput & { anchor: AnchorRect }): Point {
    const centeredX = anchor.x + (anchor.width - card.width) / 2;
    const centeredY = anchor.y + (anchor.height - card.height) / 2;
    switch (side) {
        case 'bottom':
            return { x: centeredX, y: anchor.y + anchor.height + offset };
        case 'top':
            return { x: centeredX, y: anchor.y - offset - card.height };
        case 'right':
            return { x: anchor.x + anchor.width + offset, y: centeredY };
        case 'left':
            return { x: anchor.x - offset - card.width, y: centeredY };
    }
}

function placeCard(input: CardPositionInput): Point & Pick<CardPosition, 'fits'> {
    const { anchor, card, window } = input;
    if (!anchor) return { x: (window.width - card.width) / 2, y: (window.height - card.height) / 2, fits: true };

    const anchored = { ...input, anchor };
    const side = findSideWithRoom(anchored);
    return { ...positionBesideAnchor(side ?? preferredSide(input.placement), anchored), fits: side !== null };
}

/** Top-left corner for the card: on the preferred side, flipped when it does not fit, and kept inside the insets. */
export function computeCardPosition(input: CardPositionInput): CardPosition {
    const { card, window, insets } = input;
    const { x, y, fits } = placeCard(input);

    return {
        x: clamp(x, insets.left, window.width - insets.right - card.width),
        y: clamp(y, insets.top, window.height - insets.bottom - card.height),
        fits,
    };
}
