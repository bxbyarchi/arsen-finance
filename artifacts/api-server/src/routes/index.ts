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

const router: IRouter = Router();

router.use(healthRouter);
router.use(debtsRouter);
router.use(expensesRouter);
router.use(incomesRouter);
router.use(profileRouter);
router.use(aiRouter);
router.use(projectsRouter);
router.use(davlatovRouter);
router.use(goalsRouter);

export default router;
