import { db } from "../../db";
import { learnedTemplatesTable } from "../../db/schema";

import { eq } from "drizzle-orm";

import type { LearnedTemplateDefinition }
from "../models/learningResult";

export class TemplateRepository {

    async save(

        fingerprint: string,

        template: LearnedTemplateDefinition

    ) {

        const existing =
            await db
                .select()
                .from(learnedTemplatesTable)
                .where(
                    eq(
                        learnedTemplatesTable.fingerprint,
                        fingerprint
                    )
                );

        if (existing.length > 0) {

            await db
                .update(
                    learnedTemplatesTable
                )
                .set({

                    templateJson:
                        JSON.stringify(
                            template
                        ),

                    updatedAt:
                        new Date()

                })
                .where(
                    eq(
                        learnedTemplatesTable.fingerprint,
                        fingerprint
                    )
                );

            return;
        }

        await db
            .insert(
                learnedTemplatesTable
            )
            .values({

                fingerprint,

                templateJson:
                    JSON.stringify(
                        template
                    )

            });

    }

    async findByFingerprint(

        fingerprint: string

    ) {

        const rows =
            await db
                .select()
                .from(
                    learnedTemplatesTable
                )
                .where(
                    eq(
                        learnedTemplatesTable.fingerprint,
                        fingerprint
                    )
                );

        return rows[0] ?? null;

    }

}