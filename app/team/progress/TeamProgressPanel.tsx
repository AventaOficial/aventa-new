import type { TeamProgressView } from '@/lib/team/progression/read';
import {
  formatTeamXp,
  LEADERBOARD_PERIOD_LABEL,
  levelLine,
  streakLine,
  TEAM_XP_EXPLAINER,
} from '@/lib/team/progression/present';

const SECTION = 'border-t border-[#d2d2d7] pt-6 dark:border-[#2a2a2a]';
const LABEL = 'text-sm text-[#737373]';
const BODY = 'mt-1 text-sm leading-6 text-[#424245] dark:text-[#a1a1a6]';

export function TeamProgressPanel({ view }: { view: TeamProgressView }) {
  const level = view.level ? levelLine(view.level) : null;
  const board = view.leaderboard;

  return (
    <section aria-label="Tu progreso en el equipo" className="mt-12 max-w-xl space-y-6">
      <p className={LABEL}>{TEAM_XP_EXPLAINER}</p>

      {level && view.level ? (
        <div className={SECTION}>
          <h2 className="text-xl font-semibold tracking-tight">{level.title}</h2>
          <p className={BODY}>{level.detail}</p>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e5e5ea] dark:bg-[#2a2a2a]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(view.level.progress * 100)}
          >
            <div className="h-full bg-violet-600" style={{ width: `${Math.round(view.level.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {view.recognition.length > 0 ? (
        <ul className={`${SECTION} space-y-1`}>
          {view.recognition.map((line) => (
            <li key={line} className="text-base font-medium text-[#1d1d1f] dark:text-[#fafafa]">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {view.streak ? (
        <div className={SECTION}>
          <p className={LABEL}>Racha</p>
          <p className={BODY}>{streakLine(view.streak.current)}</p>
          {view.streak.longest > 0 ? <p className={LABEL}>Mejor racha: {view.streak.longest} días</p> : null}
        </div>
      ) : null}

      <div className={SECTION}>
        <p className={LABEL}>Misiones</p>
        {view.missions.length === 0 ? (
          <p className={BODY}>Este equipo todavía no tiene misiones activas.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {view.missions.map((mission) => (
              <li key={mission.id}>
                <p className="text-sm font-medium">{mission.title}</p>
                <p className={BODY}>
                  {mission.description} · {mission.completed ? 'Completada' : `${mission.progress} de ${mission.target}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={SECTION}>
        <p className={LABEL}>Reconocimientos</p>
        {view.achievements.length === 0 ? (
          <p className={BODY}>Aún no hay reconocimientos de equipo.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {view.achievements.map((item) => (
              <li key={item.key} className={BODY}>
                {item.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      {board ? (
        <div className={SECTION}>
          <p className={LABEL}>Ranking del equipo · {LEADERBOARD_PERIOD_LABEL[board.period]} · Team XP</p>
          {board.self?.position ? (
            <p className={BODY}>
              Vas en el lugar {board.self.position} de {board.self.rankedMembers} con {formatTeamXp(board.self.teamXp)}.
            </p>
          ) : (
            <p className={BODY}>Todavía no tienes Team XP en este periodo.</p>
          )}
          {board.top.length > 0 ? (
            <ol className="mt-3 space-y-1">
              {board.top.map((entry, index) => (
                <li
                  key={`row-${index}`}
                  className={`flex justify-between text-sm ${entry.isSelf ? 'font-semibold' : 'text-[#424245] dark:text-[#a1a1a6]'}`}
                >
                  <span>
                    {entry.position}. {entry.isSelf ? 'Tú' : entry.displayName}
                  </span>
                  <span className="tabular-nums">{formatTeamXp(entry.teamXp)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
