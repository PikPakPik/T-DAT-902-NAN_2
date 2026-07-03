import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dpe } from './dpe.entity';
import { DpeClasseCountType, DpeStatsType } from './dpe.object-type';

/** Classes énergie/GES d'un DPE, de la plus performante (A) à la moins (G). */
export enum DpeClasse {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E',
  F = 'F',
  G = 'G',
}

/** Classes DPE ordonnées, affichées même lorsqu'aucun diagnostic n'existe. */
const DPE_CLASSES = Object.values(DpeClasse);

interface SummaryRow {
  total: number;
  surface_moyenne: string | null;
  annee_moyenne: string | null;
}

interface ClasseRow {
  classe: string | null;
  count: number;
}

@Injectable()
export class DpeService {
  constructor(
    @InjectRepository(Dpe)
    private readonly dpeRepository: Repository<Dpe>,
  ) {}

  async findStatsByCode(code: string): Promise<DpeStatsType | null> {
    const summaryRows = await this.dpeRepository.query<SummaryRow[]>(
      `
      SELECT
        COUNT(*)::int AS total,
        ROUND(AVG(NULLIF(surface_habitable, 0))::numeric, 2) AS surface_moyenne,
        ROUND(AVG(NULLIF(annee_construction, 0))::numeric, 0) AS annee_moyenne
      FROM dpes
      WHERE code_insee = $1
      `,
      [code],
    );

    const total = summaryRows[0]?.total ?? 0;
    if (!total) return null;

    const [energieRows, gesRows] = await Promise.all([
      this.dpeRepository.query<ClasseRow[]>(
        `
        SELECT classe_energie AS classe, COUNT(*)::int AS count
        FROM dpes
        WHERE code_insee = $1
        GROUP BY classe_energie
        `,
        [code],
      ),
      this.dpeRepository.query<ClasseRow[]>(
        `
        SELECT classe_ges AS classe, COUNT(*)::int AS count
        FROM dpes
        WHERE code_insee = $1
        GROUP BY classe_ges
        `,
        [code],
      ),
    ]);

    const classeEnergieDistribution = this.buildDistribution(
      energieRows,
      total,
    );

    return {
      code,
      total,
      classeEnergieDistribution,
      classeGesDistribution: this.buildDistribution(gesRows, total),
      surfaceHabitableMoyenne:
        summaryRows[0].surface_moyenne != null
          ? Number(summaryRows[0].surface_moyenne)
          : null,
      anneeConstructionMoyenne:
        summaryRows[0].annee_moyenne != null
          ? Number(summaryRows[0].annee_moyenne)
          : null,
      classeEnergieMajoritaire: this.mostFrequent(classeEnergieDistribution),
    };
  }

  /**
   * Construit une répartition ordonnée A→G en incluant les classes absentes
   * (count 0) puis toute classe atypique (ex. "N/A") rencontrée en base.
   */
  private buildDistribution(
    rows: ClasseRow[],
    total: number,
  ): DpeClasseCountType[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const classe = (row.classe ?? '').trim().toUpperCase() || 'N/A';
      counts.set(classe, (counts.get(classe) ?? 0) + row.count);
    }

    const ordered = [
      ...DPE_CLASSES,
      ...[...counts.keys()]
        .filter((classe) => !DPE_CLASSES.includes(classe as DpeClasse))
        .sort(),
    ];

    return ordered.map((classe) => {
      const count = counts.get(classe) ?? 0;
      return {
        classe,
        count,
        pourcentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
      };
    });
  }

  private mostFrequent(distribution: DpeClasseCountType[]): string | null {
    let best: DpeClasseCountType | null = null;
    for (const entry of distribution) {
      if (entry.count > 0 && (!best || entry.count > best.count)) {
        best = entry;
      }
    }
    return best?.classe ?? null;
  }
}
