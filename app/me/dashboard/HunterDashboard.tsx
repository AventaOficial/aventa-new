'use client';

import HunterHeader from '@/app/me/dashboard/HunterHeader';
import HunterProgress from '@/app/me/dashboard/HunterProgress';
import HunterNextAction from '@/app/me/dashboard/HunterNextAction';
import HunterProgram from '@/app/me/dashboard/HunterProgram';
import HunterRewardSummary from '@/app/me/dashboard/HunterRewardSummary';
import HunterActivitySummary from '@/app/me/HunterActivitySummary';
import { useMyRewards } from '@/app/me/dashboard/useMyRewards';
import type { HunterRewardSignals } from '@/lib/me/hunterNextAction';

import HunterOffersPreview from '@/app/me/dashboard/HunterOffersPreview';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type HunterDashboardProps = {
  displayName: string;
  avatarUrl: string | null;
  level: number;
  score: number;
  publicHref: string | null;
  avatarUploading: boolean;
  onPickAvatar: () => void;
  onPublish: () => void;
  published: number;
  approved: number;
  pending: number;
  rejected: number;
  expired: number;
  positiveVotes: number;
  comments: number;
  views: number;
  offers: Array<{ id: string; title: string; dealStatus: DealStatus }>;
};

export default function HunterDashboard(props: HunterDashboardProps) {
  const rewards = useMyRewards();
  const signals: HunterRewardSignals | null =
    rewards.kind === 'ready'
      ? rewards.rows.filter((row) => !row.isSynthetic).reduce<HunterRewardSignals>(
          (acc, row) => {
            acc.any += 1;
            if (row.uiStatus === 'validating') acc.validating += 1;
            if (row.uiStatus === 'available') acc.ready += 1;
            return acc;
          },
          { validating: 0, ready: 0, any: 0 },
        )
      : null;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="order-2 md:order-1 md:col-span-2">
        <HunterHeader
          displayName={props.displayName}
          avatarUrl={props.avatarUrl}
          level={props.level}
          publicHref={props.publicHref}
          avatarUploading={props.avatarUploading}
          onPickAvatar={props.onPickAvatar}
        />
      </div>
      <div className="order-1 md:order-2">
        <HunterNextAction
          published={props.published}
          approved={props.approved}
          pending={props.pending}
          rejected={props.rejected}
          expired={props.expired}
          publicHref={props.publicHref}
          rewards={signals}
          onPublish={props.onPublish}
        />
      </div>
      <div className="order-7 md:order-3">
        <HunterProgress level={props.level} score={props.score} />
      </div>
      <div className="order-3 md:order-5">
        <HunterRewardSummary state={rewards} />
      </div>
      <div className="order-4 md:col-span-2">
        <HunterProgram />
      </div>
      <div className="order-5 md:order-6">
        <HunterOffersPreview offers={props.offers} />
      </div>
      <div className="order-6 md:order-7 md:col-span-2">
        <HunterActivitySummary
          published={props.published}
          approved={props.approved}
          pending={props.pending}
          rejected={props.rejected}
          positiveVotes={props.positiveVotes}
          comments={props.comments}
          views={props.views}
        />
      </div>
    </div>
  );
}
