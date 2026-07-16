import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import depotsRouter from "./depots";
import stockRouter from "./stock";
import uploadsRouter from "./uploads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/users", usersRouter);
router.use("/depots", depotsRouter);
router.use("/stock", stockRouter);
router.use("/uploads", uploadsRouter);

export default router;
