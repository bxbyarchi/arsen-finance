import { Router, type IRouter } from "express";
import healthRouter from "./health";
import debtsRouter from "./debts";
import expensesRouter from "./expenses";
import incomesRouter from "./incomes";
import profileRouter from "./profile";
import aiRouter from "./ai";
import projectsRouter from "./projects";
import davlatovRouter from "./davlatov";
import goalsRouter from "./goals";
import behavioralRouter from "./behavioral";
import financialResilienceRouter from "./financial-resilience";
import hypothesesRouter from "./hypotheses";
import advisorRouter from "./advisor";
import telegramRouter from "./telegram";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(telegramRouter);
router.use(requireAuth);
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
router.use(debtsRouter);
router.use(expensesRouter);
router.use(incomesRouter);
router.use(profileRouter);
router.use(aiRouter);
router.use(projectsRouter);
router.use(davlatovRouter);
router.use(goalsRouter);
router.use(behavioralRouter);
router.use(financialResilienceRouter);
router.use(hypothesesRouter);
router.use(advisorRouter);

export default router;
