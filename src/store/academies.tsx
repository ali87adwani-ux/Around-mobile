/**
 * Academies, their programs and child enrollments. Demo data on the device or the academy_* tables.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { L10n, Level } from '@/data/types';
import { errorCode } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useApp, type Result } from './AppStore';

export interface Academy {
  id: string;
  ownerId?: string;
  name: L10n;
  area: L10n;
  about: L10n;
  governorate: string;
  rating: number;
  tint: [string, string];
}
export interface Program {
  id: string;
  academyId: string;
  name: L10n;
  coach: L10n;
  ageMin: number;
  ageMax: number;
  level: Level;
  days: number[];
  startHour: number;
  duration: number;
  monthlyFee: number;
  capacity: number;
  enrolled: number;
}
export interface Enrollment {
  id: string;
  programId: string;
  userId: string;
  childName: string;
  childAge: number;
  createdAt: number;
}
export type ProgramInput = Omit<Program, 'id' | 'academyId' | 'enrolled'>;

interface Ctx {
  academies: Academy[];
  programs: Program[];
  myEnrollments: Enrollment[];
  /** Academies owned by the signed-in user (academy owner dashboard). */
  ownedAcademies: Academy[];
  /** All enrollments for the owner's academies (or everything, for admins). */
  managedEnrollments: Enrollment[];
  reload: () => Promise<void>;
  enroll: (programId: string, childName: string, childAge: number) => Promise<Result>;
  cancelEnrollment: (id: string) => Promise<Result>;
  saveProgram: (academyId: string, p: ProgramInput, id?: string) => Promise<Result>;
  deleteProgram: (id: string) => Promise<Result>;
}

const KEY = 'aldawri.academies.v1';
const C = createContext<Ctx | null>(null);

const seedAcademies: Academy[] = [
  { id: 'a1', name: { ar: 'أكاديمية النجوم', en: 'Stars Academy' }, area: { ar: 'السالمية', en: 'Salmiya' }, governorate: 'hawalli', about: { ar: 'تدريب كرة قدم للأطفال والناشئين بإشراف مدربين معتمدين.', en: 'Football coaching for kids and juniors with licensed coaches.' }, rating: 4.8, tint: ['#0B2E6F', '#1E56B3'] },
  { id: 'a2', name: { ar: 'أكاديمية الصقر', en: 'Falcon Academy' }, area: { ar: 'مشرف', en: 'Mishref' }, governorate: 'hawalli', about: { ar: 'برامج مهارات وحراسة مرمى بملعب مغطّى ومكيّف.', en: 'Skills and goalkeeping programs on an air-conditioned indoor pitch.' }, rating: 4.7, tint: ['#0F5F5C', '#1E9B8F'] },
  { id: 'a3', name: { ar: 'أكاديمية الجهراء', en: 'Jahra Football School' }, area: { ar: 'الجهراء', en: 'Jahra' }, governorate: 'jahra', about: { ar: 'تأسيس الصغار وتطوير الناشئين بأسعار مناسبة.', en: 'Foundations for little ones and development for juniors at fair prices.' }, rating: 4.5, tint: ['#3A2F7A', '#6457C2'] },
];
const P = (id: string, academyId: string, ar: string, en: string, coachAr: string, coachEn: string, ageMin: number, ageMax: number, level: Level, days: number[], startHour: number, duration: number, monthlyFee: number, capacity: number, enrolled: number): Program => ({
  id, academyId, name: { ar, en }, coach: { ar: coachAr, en: coachEn }, ageMin, ageMax, level, days, startHour, duration, monthlyFee, capacity, enrolled,
});
const seedPrograms: Program[] = [
  P('pr1', 'a1', 'البراعم', 'Little Stars', 'كابتن فهد', 'Coach Fahad', 5, 7, 'beginner', [0, 2], 16.5, 1, 30, 16, 11),
  P('pr2', 'a1', 'الأشبال', 'Cubs', 'كابتن فهد', 'Coach Fahad', 8, 11, 'beginner', [1, 3], 17, 1.5, 35, 20, 18),
  P('pr3', 'a1', 'الناشئين', 'Juniors', 'كابتن بدر', 'Coach Bader', 12, 15, 'intermediate', [0, 2, 4], 18, 1.5, 45, 22, 9),
  P('pr4', 'a2', 'حراس المرمى', 'Goalkeepers', 'كابتن سالم', 'Coach Salem', 9, 16, 'intermediate', [1, 4], 17.5, 1.5, 40, 10, 10),
  P('pr5', 'a2', 'مهارات فردية', 'Skills Lab', 'كابتن مشعل', 'Coach Meshal', 7, 13, 'beginner', [6], 10, 2, 38, 18, 7),
  P('pr6', 'a3', 'التأسيس', 'Foundations', 'كابتن ناصر', 'Coach Nasser', 6, 9, 'beginner', [0, 3], 16, 1, 20, 25, 14),
  P('pr7', 'a3', 'التطوير', 'Development', 'كابتن ناصر', 'Coach Nasser', 10, 14, 'intermediate', [1, 3, 5], 17, 1.5, 28, 25, 20),
];
const demoNames = ['يوسف', 'عبدالعزيز', 'حمد', 'فيصل', 'سعود', 'مبارك', 'جراح', 'ناصر', 'علي', 'عمر', 'خالد'];

interface DemoState {
  programs: Program[];
  enrollments: Enrollment[];
}

export function AcademiesProvider({ children }: { children: React.ReactNode }) {
  const { mode, meId, role, state: app } = useApp();
  const live = mode === 'live';
  const [academies, setAcademies] = useState<Academy[]>(live ? [] : seedAcademies);
  const [demo, setDemo] = useState<DemoState>({ programs: seedPrograms, enrollments: [] });
  const [livePrograms, setLivePrograms] = useState<Program[]>([]);
  const [liveEnrollments, setLiveEnrollments] = useState<Enrollment[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (live) return;
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setDemo(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [live]);
  useEffect(() => {
    if (!live && hydrated) AsyncStorage.setItem(KEY, JSON.stringify(demo)).catch(() => {});
  }, [demo, live, hydrated]);

  const reload = useCallback(async () => {
    if (!live || !supabase) return;
    try {
      const [a, p, counts, e] = await Promise.all([
        supabase.from('academies').select('*').order('rating', { ascending: false }),
        supabase.from('academy_programs').select('*').eq('active', true).order('age_min'),
        supabase.rpc('program_counts'),
        meId ? supabase.from('academy_enrollments').select('*').eq('status', 'active') : Promise.resolve({ data: [], error: null }),
      ]);
      const countBy = new Map<string, number>(((counts.data ?? []) as { program_id: string; enrolled: number }[]).map((c) => [c.program_id, Number(c.enrolled)]));
      setAcademies(
        (a.data ?? []).map((r: Record<string, any>) => ({
          id: r.id, ownerId: r.owner_id ?? undefined, name: { ar: r.name_ar, en: r.name_en }, area: { ar: r.area_ar, en: r.area_en },
          about: { ar: r.about_ar, en: r.about_en }, governorate: r.governorate, rating: Number(r.rating), tint: [r.tint[0], r.tint[1] ?? r.tint[0]],
        })),
      );
      setLivePrograms(
        (p.data ?? []).map((r: Record<string, any>) => ({
          id: r.id, academyId: r.academy_id, name: { ar: r.name_ar, en: r.name_en }, coach: { ar: r.coach_ar, en: r.coach_en },
          ageMin: r.age_min, ageMax: r.age_max, level: r.level, days: r.days, startHour: Number(r.start_hour), duration: Number(r.duration_hours),
          monthlyFee: Number(r.monthly_fee), capacity: r.capacity, enrolled: countBy.get(r.id) ?? 0,
        })),
      );
      setLiveEnrollments(
        ((e.data ?? []) as Record<string, any>[]).map((r) => ({ id: r.id, programId: r.program_id, userId: r.user_id, childName: r.child_name, childAge: r.child_age, createdAt: Date.parse(r.created_at) })),
      );
    } catch {}
  }, [live, meId]);

  useEffect(() => {
    reload();
  }, [reload, role]);

  const value = useMemo<Ctx>(() => {
    const programs = live ? livePrograms : demo.programs;
    const allEnrollments = live ? liveEnrollments : demo.enrollments;
    const demoAcademyOwner = !live && app.demoAcademy;
    const ownedAcademies = live ? academies.filter((a) => a.ownerId === meId) : demoAcademyOwner ? academies.slice(0, 1) : [];
    const ownedIds = new Set(ownedAcademies.map((a) => a.id));
    const ownedProgramIds = new Set(programs.filter((p) => ownedIds.has(p.academyId)).map((p) => p.id));
    // Demo: fake existing students so the owner dashboard has content.
    const demoRoster: Enrollment[] = demoAcademyOwner
      ? programs
          .filter((p) => ownedIds.has(p.academyId))
          .flatMap((p) =>
            Array.from({ length: Math.min(p.enrolled - demo.enrollments.filter((e) => e.programId === p.id).length, 12) }, (_, i) => ({
              id: `demo-${p.id}-${i}`, programId: p.id, userId: 'other', childName: demoNames[(i + p.ageMin) % demoNames.length], childAge: p.ageMin + (i % (p.ageMax - p.ageMin + 1)), createdAt: 0,
            })),
          )
      : [];
    const run = async (fn: () => Promise<void>): Promise<Result> => {
      try {
        await fn();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: errorCode(e) };
      }
    };
    return {
      academies,
      programs,
      myEnrollments: allEnrollments.filter((e) => e.userId === meId),
      ownedAcademies,
      managedEnrollments: role === 'admin' ? allEnrollments : [...allEnrollments.filter((e) => ownedProgramIds.has(e.programId)), ...demoRoster],
      reload,
      enroll: (programId, childName, childAge) =>
        run(async () => {
          const p = programs.find((x) => x.id === programId);
          if (!p) throw new Error('program_not_found');
          if (childAge < p.ageMin || childAge > p.ageMax) throw new Error('age_out_of_range');
          if (p.enrolled >= p.capacity) throw new Error('program_full');
          if (live && supabase) {
            const { error } = await supabase.rpc('enroll_child', { p_program: programId, p_child_name: childName, p_child_age: childAge });
            if (error) throw error;
            await reload();
            return;
          }
          setDemo((d) => ({
            programs: d.programs.map((x) => (x.id === programId ? { ...x, enrolled: x.enrolled + 1 } : x)),
            enrollments: [...d.enrollments, { id: `en${Date.now()}`, programId, userId: meId, childName, childAge, createdAt: Date.now() }],
          }));
        }),
      cancelEnrollment: (id) =>
        run(async () => {
          if (live && supabase) {
            const { error } = await supabase.rpc('cancel_enrollment', { p_enrollment: id });
            if (error) throw error;
            await reload();
            return;
          }
          const e = demo.enrollments.find((x) => x.id === id);
          const programId = e?.programId ?? id.split('-')[1];
          setDemo((d) => ({
            programs: d.programs.map((x) => (x.id === programId ? { ...x, enrolled: Math.max(0, x.enrolled - 1) } : x)),
            enrollments: d.enrollments.filter((x) => x.id !== id),
          }));
        }),
      saveProgram: (academyId, p, id) =>
        run(async () => {
          if (live && supabase) {
            const row = {
              academy_id: academyId, name_ar: p.name.ar, name_en: p.name.en, coach_ar: p.coach.ar, coach_en: p.coach.en, age_min: p.ageMin, age_max: p.ageMax,
              level: p.level, days: p.days, start_hour: p.startHour, duration_hours: p.duration, monthly_fee: p.monthlyFee, capacity: p.capacity,
            };
            const { error } = id ? await supabase.from('academy_programs').update(row).eq('id', id) : await supabase.from('academy_programs').insert(row);
            if (error) throw error;
            await reload();
            return;
          }
          setDemo((d) => ({
            ...d,
            programs: id ? d.programs.map((x) => (x.id === id ? { ...x, ...p } : x)) : [...d.programs, { ...p, id: `pr${Date.now()}`, academyId, enrolled: 0 }],
          }));
        }),
      deleteProgram: (id) =>
        run(async () => {
          if (live && supabase) {
            const { error } = await supabase.from('academy_programs').delete().eq('id', id);
            if (error) throw error;
            await reload();
            return;
          }
          setDemo((d) => ({ programs: d.programs.filter((x) => x.id !== id), enrollments: d.enrollments.filter((e) => e.programId !== id) }));
        }),
    };
  }, [live, livePrograms, liveEnrollments, demo, academies, meId, role, app.demoAcademy, reload]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useAcademies() {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useAcademies must be used inside AcademiesProvider');
  return ctx;
}
