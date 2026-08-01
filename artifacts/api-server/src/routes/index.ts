import { Router, type IRouter } from "express";
import healthRouter from "./health";
import debtsRouter from "./debts";
import expensesRouter from "./expenses";
import incomesRouter from "./incomes";
import profileRouter from "./profile";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(debtsRouter);
router.use(expensesRouter);
router.use(incomesRouter);
router.use(profileRouter);
router.use(aiRouter);

export default router;
