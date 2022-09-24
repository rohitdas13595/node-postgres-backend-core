import { RequestHandler } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import { ExceptionHandler } from "winston";
import { Application } from "../../core/app";
import { Controller, Methods } from "../../core/controller";
import { ServiceController } from "../../core/ServiceController";
import { User } from "./user.entity";
import { UserService } from "./user.service";

export class UserController extends ServiceController<User>  {
  public path: string = '/user'
  protected controllers: Controller[];
  protected mw: RequestHandler<ParamsDictionary, any, any, ParsedQs, Record<string, any>>[];
  public service: UserService;
  constructor(app: Application, userService: UserService) {
    super(app, User, userService);
    this.service = userService;
    this.controllers = [];
    this.mw = []
    this.addRoutes({
      path: '/exception',
      handler: this.exception.bind(this),
      localMiddleware: [],
      method: Methods.GET
    })
  }

  exception() {
    throw new Error("Exception")
  }
}