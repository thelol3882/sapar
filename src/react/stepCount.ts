export interface StepCount {
    /** One-based. */
    position: number;
    total: number;
}

export interface StepAnnouncement extends StepCount {
    title: string;
}

export const defaultAnnounceStep = ({ position, total, title }: StepAnnouncement): string =>
    `Step ${position} of ${total}: ${title}`;

export const defaultProgress = ({ position, total }: StepCount): string => `${position} / ${total}`;
