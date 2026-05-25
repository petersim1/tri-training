import type React from "react";

type SelectedDay = { y: number; m: number; d: number };

export const ActivityModal: React.FC<{
  day: SelectedDay;
  state?: "summary" | "add" | "routine";
  onClose: () => void;
}> = ({ day, state = "summary", onClose }) => {
  return <></>;
  //   const [step, setStep] = useState(state);

  //   const key = `${day.y}-${String(day.m + 1).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;

  //   const data = useQuery({
  //     queryKey: queryKeys.dayDetails(key),
  //     queryFn: () =>
  //       dayActions.dayInfo({
  //         data: {
  //           dayKey: key,
  //           timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  //         },
  //       }),
  //   });

  //   useEffect(() => {
  //     const onKey = (e: KeyboardEvent) => {
  //       if (e.key !== "Escape") {
  //         return;
  //       }
  //       onClose();
  //     };
  //     window.addEventListener("keydown", onKey);
  //     return () => window.removeEventListener("keydown", onKey);
  //   }, [day, onClose]);

  //   return (
  //     <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
  //       <button
  //         type="button"
  //         aria-label="Close dialog"
  //         className="absolute inset-0 cursor-default border-0 bg-black/60 p-0"
  //         onClick={onClose}
  //       />
  //       <div
  //         role="dialog"
  //         aria-modal="true"
  //         aria-labelledby="day-dialog-title"
  //         className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
  //       >
  //         {state === "summary" && (
  //           <SummaryModal setStep={setStep} day={day} onClose={onClose} />
  //         )}
  //         {state === "add" && (
  //           <AddModal setStep={setStep} day={day} onClose={onClose} />
  //         )}
  //         {state === "routine" && (
  //           <RoutineModel setStep={setStep} day={day} onClose={onClose} />
  //         )}
  //       </div>
  //     </div>
  //   );
  // };

  // const SummaryModal: React.FC<{
  //   setStep: React.Dispatch<React.SetStateAction<"summary" | "add" | "routine">>;
  //   day: SelectedDay;
  //   onClose: () => void;
  // }> = ({ setStep, day, onClose }) => {
  //   const dialogTitle = new Date(day.y, day.m, day.d).toLocaleDateString(
  //     undefined,
  //     {
  //       weekday: "long",
  //       month: "long",
  //       day: "numeric",
  //       year: "numeric",
  //     },
  //   );

  //   return (
  //     <>
  //       <div className="mb-4 flex items-start justify-between gap-2">
  //         <div>
  //           <h2
  //             id="day-dialog-title"
  //             className="text-lg font-semibold text-zinc-100"
  //           >
  //             {dialogTitle}
  //           </h2>
  //           <p className="text-sm text-zinc-400">This day</p>
  //         </div>
  //         <button
  //           type="button"
  //           onClick={onClose}
  //           className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
  //         >
  //           Close
  //         </button>
  //       </div>

  //       <div className="mb-6 space-y-6">
  //         <section>
  //           <h3 className="mb-2 text-sm font-medium text-zinc-200">
  //             Current Plans
  //           </h3>
  //           {plannedOrSkippedPlans.length === 0 ? (
  //             <p className="text-sm text-zinc-500">None for this day.</p>
  //           ) : (
  //             <ul className="space-y-2">
  //               {plannedOrSkippedPlans.map((p) => {
  //                 const cardioTargets = formatPlannedCardioTargets(p);
  //                 return (
  //                   <li key={p.id}>
  //                     <button
  //                       type="button"
  //                       onClick={() => openPlanLinkFromSummary(p.id)}
  //                       className="block w-full rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-sm text-zinc-200 hover:border-zinc-600"
  //                     >
  //                       <span className="capitalize text-zinc-100">{p.kind}</span>
  //                       <span className="text-zinc-500"> · {p.status}</span>
  //                       {cardioTargets ? (
  //                         <p className="mt-1 text-left text-xs text-zinc-500">
  //                           {cardioTargets}
  //                         </p>
  //                       ) : null}
  //                       {p.status === "planned" &&
  //                       (p.notes?.trim() ?? "") !== "" ? (
  //                         <p className="mt-1.5 whitespace-pre-wrap text-left text-xs leading-snug text-zinc-500">
  //                           {p.notes?.trim()}
  //                         </p>
  //                       ) : null}
  //                     </button>
  //                   </li>
  //                 );
  //               })}
  //             </ul>
  //           )}
  //         </section>

  //         {completedPlansForDay.length > 0 ? (
  //           <section>
  //             <h3 className="mb-2 text-sm font-medium text-zinc-200">
  //               Completed
  //             </h3>
  //             <ul className="space-y-2">
  //               {completedPlansForDay.map((p) => {
  //                 const linked = Boolean(p.completedWorkoutId);
  //                 const sessionTitle = p.completedWorkout
  //                   ? completedWorkoutTitle(p.completedWorkout)
  //                   : null;
  //                 const sessionBrief = p.completedWorkout
  //                   ? formatCompletedSessionBrief(p.completedWorkout, {
  //                       surrogateBodyWeightKg: surrogateBwKgForLiftVolume,
  //                     })
  //                   : null;
  //                 const planTargets = formatPlannedCardioTargets(p);
  //                 return (
  //                   <li key={p.id}>
  //                     <button
  //                       type="button"
  //                       onClick={() => openPlanLinkFromSummary(p.id)}
  //                       className="block w-full rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-sm text-zinc-200 hover:border-zinc-600"
  //                     >
  //                       <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
  //                         <span className="capitalize text-zinc-100">
  //                           {p.kind}
  //                         </span>
  //                         <span className="text-zinc-500">· {p.status}</span>
  //                         <span
  //                           className={
  //                             linked ? "text-emerald-500/90" : "text-amber-400/90"
  //                           }
  //                         >
  //                           · {linked ? "Linked" : "Not linked"}
  //                         </span>
  //                         {linked && sessionTitle ? (
  //                           <span className="text-zinc-500">
  //                             · {sessionTitle}
  //                           </span>
  //                         ) : null}
  //                       </div>
  //                       {sessionBrief ? (
  //                         <p className="mt-1 text-left text-xs text-zinc-500">
  //                           {sessionBrief}
  //                         </p>
  //                       ) : null}
  //                       {planTargets ? (
  //                         <p className="mt-0.5 text-left text-xs text-zinc-600">
  //                           Planned: {planTargets}
  //                         </p>
  //                       ) : null}
  //                     </button>
  //                   </li>
  //                 );
  //               })}
  //             </ul>
  //           </section>
  //         ) : null}

  //         {showCompletedNoPlanSection ? (
  //           <section>
  //             <h3 className="mb-2 text-sm font-medium text-zinc-200">
  //               Completed (no plan)
  //             </h3>
  //             {unresolvedForDayQuery.isLoading ? (
  //               <p className="text-sm text-zinc-500">Loading…</p>
  //             ) : unresolvedForDayQuery.isError ? (
  //               <p className="text-sm text-red-400">Could not load sessions.</p>
  //             ) : (
  //               <ul className="space-y-3">
  //                 {[...(unresolvedForDayQuery.data ?? [])]
  //                   .sort((a, b) => a.id.localeCompare(b.id))
  //                   .map((cw) => {
  //                     const title = completedWorkoutTitle(cw) ?? "Session";
  //                     const kindLabel =
  //                       inferPlanKindFromCompletedRow(cw) ?? cw.activityKind;
  //                     const sessionBrief = formatCompletedSessionBrief(cw, {
  //                       surrogateBodyWeightKg: surrogateBwKgForLiftVolume,
  //                     });
  //                     const matchingPlans = dialogPlans.filter((p) =>
  //                       planAcceptsLinkForCompleted(p, cw),
  //                     );
  //                     const pk = inferPlanKindFromCompletedRow(cw);
  //                     return (
  //                       <li
  //                         key={cw.id}
  //                         className="rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2"
  //                       >
  //                         <div className="text-sm text-zinc-100">{title}</div>
  //                         <div className="mt-0.5 text-xs capitalize text-zinc-500">
  //                           {cw.vendor === "hevy" ? "Hevy" : "Strava"} ·{" "}
  //                           {kindLabel}
  //                         </div>
  //                         {sessionBrief ? (
  //                           <div className="mt-1 text-xs text-zinc-500">
  //                             {sessionBrief}
  //                           </div>
  //                         ) : null}
  //                         <div className="mt-2">
  //                           {matchingPlans.length === 1 ? (
  //                             <button
  //                               type="button"
  //                               disabled={
  //                                 updatePlanMutation.isPending &&
  //                                 linkingCompletedWorkoutId === cw.id
  //                               }
  //                               onClick={() => {
  //                                 setPlanErr(null);
  //                                 setLinkingCompletedWorkoutId(cw.id);
  //                                 updatePlanMutation.mutate(
  //                                   updatePlanPayloadForCompletedLink(
  //                                     cw,
  //                                     matchingPlans[0].id,
  //                                   ),
  //                                   {
  //                                     onSettled: () =>
  //                                       setLinkingCompletedWorkoutId(null),
  //                                   },
  //                                 );
  //                               }}
  //                               className="rounded border border-violet-500/60 bg-violet-950/40 px-2.5 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-950/70 disabled:cursor-not-allowed disabled:opacity-50"
  //                             >
  //                               {updatePlanMutation.isPending &&
  //                               linkingCompletedWorkoutId === cw.id
  //                                 ? "Linking…"
  //                                 : "Link to plan"}
  //                             </button>
  //                           ) : matchingPlans.length > 1 ? (
  //                             <div className="space-y-1.5">
  //                               <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
  //                                 Choose a plan to link
  //                               </p>
  //                               <ul className="flex flex-col gap-1">
  //                                 {matchingPlans.map((p) => {
  //                                   const matchTargets =
  //                                     formatPlannedCardioTargets(p);
  //                                   return (
  //                                     <li key={p.id}>
  //                                       <button
  //                                         type="button"
  //                                         disabled={
  //                                           updatePlanMutation.isPending &&
  //                                           linkingCompletedWorkoutId === cw.id
  //                                         }
  //                                         onClick={() => {
  //                                           setPlanErr(null);
  //                                           setLinkingCompletedWorkoutId(cw.id);
  //                                           updatePlanMutation.mutate(
  //                                             updatePlanPayloadForCompletedLink(
  //                                               cw,
  //                                               p.id,
  //                                             ),
  //                                             {
  //                                               onSettled: () =>
  //                                                 setLinkingCompletedWorkoutId(
  //                                                   null,
  //                                                 ),
  //                                             },
  //                                           );
  //                                         }}
  //                                         className="w-full rounded border border-violet-500/50 bg-violet-950/30 px-2 py-1.5 text-left text-xs text-violet-200 hover:bg-violet-950/55 disabled:cursor-not-allowed disabled:opacity-50"
  //                                       >
  //                                         <span className="capitalize">
  //                                           {p.kind}
  //                                         </span>
  //                                         <span className="text-zinc-500">
  //                                           {" "}
  //                                           · {p.status}
  //                                         </span>
  //                                         {matchTargets ? (
  //                                           <span className="mt-0.5 block text-[11px] text-zinc-500">
  //                                             {matchTargets}
  //                                           </span>
  //                                         ) : null}
  //                                         {(p.notes?.trim() ?? "") !== "" ? (
  //                                           <span className="mt-1 block whitespace-pre-wrap text-[11px] leading-snug text-zinc-500">
  //                                             {p.notes?.trim()}
  //                                           </span>
  //                                         ) : null}
  //                                       </button>
  //                                     </li>
  //                                   );
  //                                 })}
  //                               </ul>
  //                             </div>
  //                           ) : pk &&
  //                             dialogDayKey !== null &&
  //                             !isLocalDayKeyInFuture(dialogDayKey) ? (
  //                             <button
  //                               type="button"
  //                               disabled={
  //                                 createPlanFromActivityMutation.isPending &&
  //                                 linkingCompletedWorkoutId === cw.id
  //                               }
  //                               onClick={() => {
  //                                 if (!dialogDayKey) {
  //                                   return;
  //                                 }
  //                                 setPlanErr(null);
  //                                 setLinkingCompletedWorkoutId(cw.id);
  //                                 createPlanFromActivityMutation.mutate(
  //                                   createPlanFromActivityPayloadForCompleted(
  //                                     cw,
  //                                     pk,
  //                                     dialogDayKey,
  //                                   ),
  //                                   {
  //                                     onSettled: () =>
  //                                       setLinkingCompletedWorkoutId(null),
  //                                   },
  //                                 );
  //                               }}
  //                               className="rounded border border-violet-500/60 bg-violet-950/40 px-2.5 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-950/70 disabled:cursor-not-allowed disabled:opacity-50"
  //                             >
  //                               {createPlanFromActivityMutation.isPending &&
  //                               linkingCompletedWorkoutId === cw.id
  //                                 ? "Linking…"
  //                                 : "Link unplanned activity?"}
  //                             </button>
  //                           ) : (
  //                             <p className="text-xs text-zinc-500">
  //                               {!pk
  //                                 ? "This activity type cannot be linked to a plan here."
  //                                 : "Linking from a future day is not available."}
  //                             </p>
  //                           )}
  //                         </div>
  //                       </li>
  //                     );
  //                   })}
  //               </ul>
  //             )}
  //           </section>
  //         ) : null}

  //         <div className="flex flex-col gap-2">
  //           <button
  //             type="button"
  //             onClick={openAddPlanScreen}
  //             className="w-full rounded border border-zinc-600 bg-zinc-900/50 px-3 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
  //           >
  //             Add plan
  //           </button>
  //         </div>
  //       </div>

  //       <div className="border-t border-zinc-800 pt-4">
  //         <form
  //           key={`${dialogDayKey ?? "x"}-${dialogWeight?.weightLb ?? "none"}`}
  //           className="flex w-full min-w-0 flex-nowrap items-stretch gap-2"
  //           onSubmit={(e) => {
  //             e.preventDefault();
  //             if (!dialogDayKey) {
  //               return;
  //             }
  //             const fd = new FormData(e.currentTarget);
  //             setWeightErr(null);
  //             const raw = String(fd.get("weight") ?? "");
  //             const w = Number.parseFloat(raw);
  //             if (!Number.isFinite(w) || w <= 0) {
  //               setWeightErr("Enter a valid weight");
  //               return;
  //             }
  //             setWeightMutation.mutate({
  //               dayKey: dialogDayKey,
  //               weightLb: w,
  //             });
  //           }}
  //         >
  //           <span className="shrink-0 self-center text-xs text-zinc-500">
  //             Weight
  //           </span>
  //           <div className="relative min-w-0 flex-1">
  //             <input
  //               name="weight"
  //               type="number"
  //               step="0.1"
  //               min="0"
  //               required
  //               inputMode="decimal"
  //               autoComplete="off"
  //               defaultValue={
  //                 dialogWeight ? dialogWeight.weightLb.toFixed(1) : ""
  //               }
  //               aria-label="Weight in pounds"
  //               className="w-full min-w-0 rounded border border-zinc-700 bg-zinc-950 py-1.5 pr-7 pl-2 text-sm tabular-nums text-zinc-100 placeholder:text-zinc-600"
  //             />
  //             <span
  //               className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-zinc-500"
  //               aria-hidden
  //             >
  //               lb
  //             </span>
  //           </div>
  //           <button
  //             type="submit"
  //             disabled={setWeightMutation.isPending}
  //             className="shrink-0 rounded border border-emerald-600 bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
  //           >
  //             {setWeightMutation.isPending ? "…" : "Save"}
  //           </button>
  //           {dialogWeight && dialogDayKey ? (
  //             <button
  //               type="button"
  //               disabled={
  //                 clearWeightMutation.isPending || setWeightMutation.isPending
  //               }
  //               className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
  //               onClick={() => {
  //                 setWeightErr(null);
  //                 clearWeightMutation.mutate(dialogDayKey);
  //               }}
  //             >
  //               {clearWeightMutation.isPending ? "…" : "Clear"}
  //             </button>
  //           ) : null}
  //         </form>
  //         {weightErr ? (
  //           <p className="mt-2 text-xs text-red-400">{weightErr}</p>
  //         ) : null}
  //       </div>
  //     </>
  //   );
  // };

  // const AddModal: React.FC<{
  //   setStep: React.Dispatch<React.SetStateAction<"summary" | "add" | "routine">>;
  //   day: SelectedDay;
  //   onClose: () => void;
  // }> = ({ setStep, day, onClose }) => {
  //   const dialogTitle = new Date(day.y, day.m, day.d).toLocaleDateString(
  //     undefined,
  //     {
  //       weekday: "long",
  //       month: "long",
  //       day: "numeric",
  //       year: "numeric",
  //     },
  //   );
  //   return (
  //     <>
  //       <div className="mb-4 flex items-center gap-2">
  //         <button
  //           type="button"
  //           onClick={() => setStep("summary")}
  //           className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
  //         >
  //           Back
  //         </button>
  //         <div className="min-w-0 flex-1">
  //           <h2
  //             id="day-dialog-title"
  //             className="text-lg font-semibold text-zinc-100"
  //           >
  //             Add plan
  //           </h2>
  //           <p className="truncate text-sm text-zinc-400">{dialogTitle}</p>
  //         </div>
  //         <button
  //           type="button"
  //           onClick={onClose}
  //           className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
  //         >
  //           Close
  //         </button>
  //       </div>

  //       {dialogDayKey !== null && selectedDay !== null ? (
  //         <form
  //           key={dialogDayKey}
  //           className="space-y-3"
  //           onSubmit={(e) => {
  //             e.preventDefault();
  //             const fd = new FormData(e.currentTarget);
  //             setPlanErr(null);
  //             const kinds = new Set(["lift", "run", "bike", "swim", "recovery"]);
  //             if (!kinds.has(planKind)) {
  //               setPlanErr("Choose a type.");
  //               return;
  //             }
  //             const dayKey = dayKeyFromParts(
  //               selectedDay.y,
  //               selectedDay.m,
  //               selectedDay.d,
  //             );
  //             const notesRaw = fd.get("notes");
  //             const notes =
  //               notesRaw === null || notesRaw === "" ? null : String(notesRaw);
  //             const routineId =
  //               planKind === "lift" &&
  //               liftRoutineId &&
  //               liftRoutineId.trim() !== ""
  //                 ? liftRoutineId
  //                 : null;
  //             const distance = isCardioKind(planKind)
  //               ? parseFormOptionalFloat(fd.get("distance"))
  //               : null;
  //             const unitsRaw = String(fd.get("distanceUnits") ?? "").trim();
  //             const distanceUnits =
  //               isCardioKind(planKind) && unitsRaw !== ""
  //                 ? unitsRaw.toLowerCase()
  //                 : null;
  //             const timeSeconds = isCardioKind(planKind)
  //               ? parseFormOptionalInt(fd.get("timeSeconds"))
  //               : null;
  //             createPlanMutation.mutate({
  //               kind: planKind,
  //               dayKey,
  //               notes,
  //               routineId,
  //               distance,
  //               distanceUnits,
  //               timeSeconds,
  //             });
  //           }}
  //         >
  //           <label className="block space-y-1">
  //             <span className="text-sm text-zinc-400">Type</span>
  //             <select
  //               name="kind"
  //               value={planKind}
  //               onChange={(ev) => setPlanKind(ev.target.value)}
  //               required
  //               className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
  //             >
  //               <option value="" disabled>
  //                 Select type
  //               </option>
  //               <option value="lift">Lift</option>
  //               <option value="run">Run</option>
  //               <option value="bike">Bike</option>
  //               <option value="swim">Swim</option>
  //               <option value="recovery">Recovery</option>
  //             </select>
  //           </label>
  //           {planKind === "lift" ? (
  //             <LiftRoutinePicker
  //               groups={hevyRoutineGroups}
  //               unfoldered={hevyRoutinesUnfoldered}
  //               selectedId={liftRoutineId}
  //               onSelect={setLiftRoutineId}
  //             />
  //           ) : null}
  //           {isCardioKind(planKind) ? (
  //             <div className="space-y-2 rounded border border-zinc-800/80 bg-zinc-900/30 px-3 py-2">
  //               <p className="text-xs text-zinc-500">
  //                 Planned targets (optional)
  //               </p>
  //               <div className="flex flex-wrap items-end gap-2">
  //                 <label className="min-w-20 flex-1">
  //                   <span className="text-xs text-zinc-500">Distance</span>
  //                   <input
  //                     name="distance"
  //                     type="text"
  //                     inputMode="decimal"
  //                     autoComplete="off"
  //                     className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
  //                   />
  //                 </label>
  //                 <label className="w-22">
  //                   <span className="text-xs text-zinc-500">Units</span>
  //                   <select
  //                     name="distanceUnits"
  //                     className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
  //                   >
  //                     <option value="">—</option>
  //                     {CARDIO_DISTANCE_UNITS.map((u) => (
  //                       <option key={u} value={u}>
  //                         {u}
  //                       </option>
  //                     ))}
  //                   </select>
  //                 </label>
  //                 <label className="min-w-26 flex-1">
  //                   <span className="text-xs text-zinc-500">Duration (sec)</span>
  //                   <input
  //                     name="timeSeconds"
  //                     type="text"
  //                     inputMode="numeric"
  //                     autoComplete="off"
  //                     className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
  //                   />
  //                 </label>
  //               </div>
  //             </div>
  //           ) : null}
  //           <label className="block space-y-1">
  //             <span className="text-sm text-zinc-400">Notes</span>
  //             <textarea
  //               name="notes"
  //               rows={3}
  //               placeholder="Optional"
  //               className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
  //             />
  //           </label>
  //           {planErr ? <p className="text-sm text-red-400">{planErr}</p> : null}
  //           <button
  //             type="submit"
  //             disabled={createPlanMutation.isPending}
  //             className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
  //           >
  //             {createPlanMutation.isPending ? "Creating…" : "Create plan"}
  //           </button>
  //         </form>
  //       ) : null}
  //     </>
  //   );
  // };

  // const RoutineModel: React.FC<{
  //   setStep: React.Dispatch<React.SetStateAction<"summary" | "add" | "routine">>;
  //   day: SelectedDay;
  //   onClose: () => void;
  // }> = ({ setStep, day, onClose }) => {
  //   const dialogTitle = new Date(day.y, day.m, day.d).toLocaleDateString(
  //     undefined,
  //     {
  //       weekday: "long",
  //       month: "long",
  //       day: "numeric",
  //       year: "numeric",
  //     },
  //   );
  //   return (
  //     <>
  //       <div className="mb-4 flex items-center gap-2">
  //         <button
  //           type="button"
  //           onClick={() => setStep("add")}
  //           className="shrink-0 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
  //         >
  //           Back
  //         </button>
  //         <div className="min-w-0 flex-1">
  //           <h2
  //             id="day-dialog-title"
  //             className="text-lg font-semibold capitalize text-zinc-100"
  //           >
  //             {linkPlan ? `${linkPlan.kind} plan` : "Plan"}
  //           </h2>
  //           <p className="text-sm leading-snug text-zinc-400">{dialogTitle}</p>
  //         </div>
  //         <button
  //           type="button"
  //           onClick={onClose}
  //           className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
  //         >
  //           Close
  //         </button>
  //       </div>

  //       {planErr ? <p className="mb-2 text-sm text-red-400">{planErr}</p> : null}

  //       {!linkPlan ? (
  //         <p className="text-sm text-zinc-500">
  //           This plan is not on this day anymore.
  //         </p>
  //       ) : (
  //         <>
  //           {linkPlan.kind === "lift" &&
  //           linkPlan.status === "planned" &&
  //           !linkPlan.completedWorkout ? (
  //             <div className="mb-3 rounded border border-zinc-800/80 bg-zinc-900/30 px-2 py-2">
  //               <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
  //                 Hevy routine
  //               </p>
  //               {planLinkRoutineEditing ? (
  //                 <>
  //                   <p className="mt-0.5 mb-2 text-[10px] leading-snug text-zinc-500">
  //                     Choose a template. Save updates the plan.
  //                   </p>
  //                   <LiftRoutinePicker
  //                     groups={hevyRoutineGroups}
  //                     unfoldered={hevyRoutinesUnfoldered}
  //                     selectedId={planLinkRoutineDraftId}
  //                     onSelect={setPlanLinkRoutineDraftId}
  //                   />
  //                   <div className="mt-2 flex flex-col gap-2 sm:flex-row">
  //                     <button
  //                       type="button"
  //                       disabled={
  //                         updatePlanMutation.isPending ||
  //                         planLinkRoutineDraftId === (linkPlan.routineId ?? null)
  //                       }
  //                       onClick={() => {
  //                         setPlanErr(null);
  //                         updatePlanMutation.mutate(
  //                           {
  //                             id: linkPlan.id,
  //                             hevyRoutineId: planLinkRoutineDraftId,
  //                           },
  //                           {
  //                             onSuccess: () => {
  //                               setPlanLinkRoutineEditing(false);
  //                             },
  //                           },
  //                         );
  //                       }}
  //                       className="flex-1 rounded border border-emerald-600/80 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-950/50 disabled:cursor-not-allowed disabled:opacity-50"
  //                     >
  //                       {updatePlanMutation.isPending
  //                         ? "Saving…"
  //                         : "Save routine"}
  //                     </button>
  //                     <button
  //                       type="button"
  //                       disabled={updatePlanMutation.isPending}
  //                       onClick={() => {
  //                         setPlanLinkRoutineDraftId(linkPlan.routineId ?? null);
  //                         setPlanLinkRoutineEditing(false);
  //                       }}
  //                       className="rounded border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
  //                     >
  //                       Cancel
  //                     </button>
  //                   </div>
  //                 </>
  //               ) : (
  //                 <>
  //                   <div className="mt-2">
  //                     <LiftRoutineReadOnlyPreview
  //                       routineId={linkPlan.routineId ?? null}
  //                       titleFromList={
  //                         linkPlan.routineId
  //                           ? (rTitle.get(linkPlan.routineId) ?? null)
  //                           : null
  //                       }
  //                     />
  //                   </div>
  //                   <button
  //                     type="button"
  //                     onClick={() => {
  //                       setPlanLinkRoutineDraftId(linkPlan.routineId ?? null);
  //                       setPlanLinkRoutineEditing(true);
  //                     }}
  //                     className="mt-3 w-full rounded border border-zinc-600 bg-zinc-900/50 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
  //                   >
  //                     Update routine
  //                   </button>
  //                 </>
  //               )}
  //             </div>
  //           ) : null}

  //           <div className="mb-2 space-y-2">
  //             <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
  //               <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
  //                 Status
  //               </span>
  //               <PlanStatusSelect
  //                 planId={linkPlan.id}
  //                 status={linkPlan.status}
  //                 disabled={Boolean(linkPlan.completedWorkout)}
  //                 onUpdated={refreshAfterPlanChange}
  //               />
  //             </div>
  //             {linkPlan.completedWorkout ? (
  //               <LinkedSessionPanel
  //                 planId={linkPlan.id}
  //                 completed={linkPlan.completedWorkout}
  //                 surrogateBodyWeightKg={surrogateBwKgForLiftVolume}
  //                 onUnlinked={refreshAfterPlanChange}
  //               />
  //             ) : !isCardioKind(linkPlan.kind) ? (
  //               <p className="rounded border border-dashed border-zinc-800/90 bg-zinc-950/40 px-2 py-1.5 text-[10px] text-zinc-500">
  //                 No session linked
  //               </p>
  //             ) : null}
  //           </div>

  //           {isCardioKind(linkPlan.kind) && !linkPlan.completedWorkout ? (
  //             <div className="mb-2">
  //               <PlanCardioTargetsField
  //                 planId={linkPlan.id}
  //                 kind={linkPlan.kind}
  //                 distance={linkPlan.distance}
  //                 distanceUnits={linkPlan.distanceUnits}
  //                 timeSeconds={linkPlan.timeSeconds}
  //                 onUpdated={refreshAfterPlanChange}
  //               />
  //             </div>
  //           ) : null}

  //           <div className="mb-2">
  //             <PlanNotesField
  //               planId={linkPlan.id}
  //               notes={linkPlan.notes}
  //               onUpdated={refreshAfterPlanChange}
  //             />
  //           </div>

  //           {linkPlan.status === "skipped" ? (
  //             <p className="mb-3 text-[11px] leading-snug text-zinc-500">
  //               Skipped — linking hidden. Change status to attach a session.
  //             </p>
  //           ) : linkPlan.completedWorkoutId ? (
  //             <div className="mt-4 border-t border-zinc-800 pt-2.5">
  //               <button
  //                 type="button"
  //                 disabled={deletePlanMutation.isPending}
  //                 className="text-[11px] text-red-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
  //                 onClick={() => deletePlanMutation.mutate(linkPlan.id)}
  //               >
  //                 {deletePlanMutation.isPending ? "Deleting…" : "Delete plan"}
  //               </button>
  //             </div>
  //           ) : linkPlan.kind === "recovery" ? (
  //             <>
  //               <p className="mb-3 text-[11px] leading-snug text-zinc-500">
  //                 Recovery is not linked to Strava or Hevy.
  //               </p>
  //               <div className="mt-4 border-t border-zinc-800 pt-2.5">
  //                 <button
  //                   type="button"
  //                   disabled={deletePlanMutation.isPending}
  //                   className="text-[11px] text-red-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
  //                   onClick={() => deletePlanMutation.mutate(linkPlan.id)}
  //                 >
  //                   {deletePlanMutation.isPending ? "Deleting…" : "Delete plan"}
  //                 </button>
  //               </div>
  //             </>
  //           ) : linkCandidatesQuery.isLoading ? (
  //             <p className="text-xs text-zinc-500">
  //               Loading sessions for this day…
  //             </p>
  //           ) : linkCandidatesQuery.isError ? (
  //             <p className="text-xs text-red-400">Could not load sessions.</p>
  //           ) : (
  //             <>
  //               {linkPlan.kind === "lift" ? (
  //                 <>
  //                   {linkCandidatesQuery.data?.hevyError ? (
  //                     <p className="mb-1.5 text-[11px] text-amber-400/90">
  //                       Hevy: {linkCandidatesQuery.data.hevyError}
  //                     </p>
  //                   ) : null}
  //                   <div className="space-y-2">
  //                     <p className="text-[11px] font-medium text-zinc-500">
  //                       Link Hevy workout
  //                     </p>
  //                     <p className="text-[11px] leading-snug text-zinc-600">
  //                       Completes plan when linked.
  //                     </p>
  //                     {(linkCandidatesQuery.data?.hevy ?? []).length === 0 ? (
  //                       <p className="text-xs text-zinc-600">
  //                         None for this day, or all are linked to other plans.
  //                       </p>
  //                     ) : (
  //                       <ul className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
  //                         {[...(linkCandidatesQuery.data?.hevy ?? [])]
  //                           .sort(
  //                             (a, b) =>
  //                               new Date(b.start_time ?? 0).getTime() -
  //                               new Date(a.start_time ?? 0).getTime(),
  //                           )
  //                           .map((w) => (
  //                             <li key={w.id ?? ""}>
  //                               <button
  //                                 type="button"
  //                                 disabled={!w.id || updatePlanMutation.isPending}
  //                                 onClick={() => {
  //                                   if (!w.id) {
  //                                     return;
  //                                   }
  //                                   updatePlanMutation.mutate({
  //                                     id: linkPlan.id,
  //                                     stravaActivityId: "",
  //                                     hevyWorkoutId: w.id,
  //                                     linkedSession:
  //                                       linkedSessionFromHevyWorkout(w),
  //                                   });
  //                                 }}
  //                                 className="w-full rounded border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-left text-[11px] leading-snug text-zinc-200 hover:border-zinc-600 disabled:opacity-50"
  //                               >
  //                                 <div className="font-medium text-zinc-100">
  //                                   {w.title ?? "Workout"}
  //                                 </div>
  //                                 <div className="text-[10px] text-zinc-500">
  //                                   {formatSessionTime(w.start_time)}
  //                                 </div>
  //                               </button>
  //                             </li>
  //                           ))}
  //                       </ul>
  //                     )}
  //                   </div>
  //                 </>
  //               ) : (
  //                 <>
  //                   {linkCandidatesQuery.data?.stravaError ? (
  //                     <p className="mb-1.5 text-[11px] text-amber-400/90">
  //                       Strava: {linkCandidatesQuery.data.stravaError}
  //                     </p>
  //                   ) : null}
  //                   <div className="space-y-2">
  //                     <p className="text-[11px] font-medium text-zinc-500">
  //                       Link Strava activity
  //                     </p>
  //                     <p className="text-[11px] leading-snug text-zinc-600">
  //                       Completes plan when linked.
  //                     </p>
  //                     {(linkCandidatesQuery.data?.strava ?? []).length === 0 ? (
  //                       <p className="text-xs text-zinc-600">
  //                         None for this day, or all are linked to other plans.
  //                       </p>
  //                     ) : (
  //                       <ul className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
  //                         {[...(linkCandidatesQuery.data?.strava ?? [])]
  //                           .sort(
  //                             (a, b) =>
  //                               new Date(b.start_date).getTime() -
  //                               new Date(a.start_date).getTime(),
  //                           )
  //                           .map((a) => (
  //                             <li key={a.id}>
  //                               <button
  //                                 type="button"
  //                                 disabled={updatePlanMutation.isPending}
  //                                 onClick={() =>
  //                                   updatePlanMutation.mutate({
  //                                     id: linkPlan.id,
  //                                     stravaActivityId: String(a.id),
  //                                     hevyWorkoutId: "",
  //                                     linkedSession:
  //                                       linkedSessionFromStravaActivity(a),
  //                                   })
  //                                 }
  //                                 className="w-full rounded border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-left text-[11px] leading-snug text-zinc-200 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
  //                               >
  //                                 <div className="font-medium text-zinc-100">
  //                                   {a.name}
  //                                 </div>
  //                                 <div className="text-[10px] text-zinc-500">
  //                                   {a.sport_type} ·{" "}
  //                                   {formatSessionTime(a.start_date)}
  //                                 </div>
  //                               </button>
  //                             </li>
  //                           ))}
  //                       </ul>
  //                     )}
  //                   </div>
  //                 </>
  //               )}

  //               <div className="mt-4 border-t border-zinc-800 pt-2.5">
  //                 <button
  //                   type="button"
  //                   disabled={deletePlanMutation.isPending}
  //                   className="text-[11px] text-red-400/90 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
  //                   onClick={() => deletePlanMutation.mutate(linkPlan.id)}
  //                 >
  //                   {deletePlanMutation.isPending ? "Deleting…" : "Delete plan"}
  //                 </button>
  //               </div>
  //             </>
  //           )}
  //         </>
  //       )}
  //     </>
  //   );
};
