'use client';

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
  positiveVotes: number | null;
  comments: number | null;
  views: number | null;
  offers: Array<{
    id: string;
    title: string;
    dealStatus: DealStatus;
    discountPrice?: number | null;
    originalPrice?: number | null;
    image?: string | null;
  }>;
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
    <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,680px)_280px] xl:items-start xl:gap-x-8 xl:gap-y-8">
      <div className="order-1 xl:col-start-1 xl:row-start-1">
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
      <div className="order-2 xl:col-start-2 xl:row-start-1">
        <HunterProgress level={props.level} score={props.score} />
      </div>
      <div className="order-3 xl:col-start-1 xl:row-start-2">
        <HunterOffersPreview offers={props.offers} published={props.published} approved={props.approved} />
      </div>
      <div className="order-4 xl:col-start-2 xl:row-start-2">
        <HunterRewardSummary state={rewards} />
      </div>
      <div className="order-5 xl:col-start-2 xl:row-start-3">
        <HunterProgram />
      </div>
      <div className="order-6 xl:col-start-2 xl:row-start-4">
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
