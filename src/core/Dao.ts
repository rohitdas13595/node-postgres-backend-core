/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import {
  Between,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ILike,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
} from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { BaseEntity } from "./BaseEntity";
import Database from "./database";
import log from "./log";
import { ErrorCode, Result, ResultWithCount, WithCount } from "./result";

export type _QueryDeepPartialEntity<T> = {
  [P in keyof T]?:
  | (T[P] extends Array<infer U>
    ? Array<_QueryDeepPartialEntity<U>>
    : T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<_QueryDeepPartialEntity<U>>
    : _QueryDeepPartialEntity<T[P]>)
  | (() => string);
};

export interface QueryOption<E> {
  /**
   * Page number
   */
  page?: number;
  /**
   * Number of items per Page
   */
  count?: number;
  /**
   * Order in which the entries should be returned
   */
  order?: "ASC" | "DESC";
  /**
   * Field on which the order should be applied
   */
  field?: keyof E;
  /**
   * Where condition
   */
  where?: FindOptionsWhere<E> | FindOptionsWhere<E>[];
  /**
   * Like Conditions
   */
  like?: { [key: string]: string };
  /**
   * Like Behaviour
   * @default 'and'
   */
  likeBehaviour?: "and" | "or";
  /**
   * From Created Date
   */
  fromCreatedDate?: Date;
  /**
   * To Created Date
   */
  toCreatedDate?: Date;
  /**
   * Database options
   */
  dbOptions?: FindManyOptions<E>;

  /**
   * Non paginated
   */
  nonPaginated?: boolean;
}

export type ReadManyOption<E> = QueryOption<E>;

export type Class<T> =
  | {
    new(): T;
  }
  | Function;

/**
 * Data Access Object for the entities
 * @class getDao
 * @param Entity Entity to be used for the getDao
 * @param name Name of the entityName
 * @returns Dao
 */
export class Dao<Entity extends BaseEntity> {
  protected database: Database;
  protected entity: EntityTarget<Entity>;
  protected entityName: string;

  constructor(database: Database, entity: EntityTarget<Entity>, name: string) {
    this.database = database;
    this.entity = entity;
    this.entityName = name;
  }
  /**
   * Create a new entity
   * @param value Value to be inserted
   * @param manager EntityManager to be used for the operation (optional). Use only for transactions
   * @returns
   */
  async create(
    value: _QueryDeepPartialEntity<Entity> | _QueryDeepPartialEntity<Entity>[],
    manager?: EntityManager
  ): Promise<Result<number | string>> {
    if (!manager) {
      manager = this.database.getConnection().createEntityManager();
    }
    const repository = manager.getRepository(this.entity);
    try {
      const result = await repository.insert(value);
      if (!(value instanceof Array)) {
        value.id =
          result.identifiers[0].id ??
          (result.identifiers[0] as [key: string])[0];
      }
      log.info("Successfully created", `${this.entityName}/create`, {});
      return new Result(
        false,
        ErrorCode.Created,
        "Success in insert",
        result.identifiers[0].id
      );
    } catch (error) {
      log.error(
        `Error in inserting ${this.entityName}`,
        `${this.entityName}/insert`,
        error
      );
      return new Result(true, ErrorCode.InternalServerError, "Error in insert");
    }
  }

  /**
   * Read a single entity
   * @param value Id of the entity to be read
   * @param manager EntityManager to be used for the operation (optional). Use only for transactions
   * @returns Result with the entity
   */
  async read(
    value: string | number | FindOneOptions<Entity>,
    manager?: EntityManager
  ): Promise<Result<Entity>> {
    if (!manager) {
      manager = this.database.getConnection().createEntityManager();
    }
    const repository = manager.getRepository(this.entity);
    try {
      let options: FindOneOptions;
      if (typeof value === "number" || typeof value === "string") {
        options = { where: { id: value } };
      } else {
        options = value;
      }
      const result = await repository.findOne(options);
      if (!result) {
        log.debug("Find not found", `${this.entityName}/read`, { id: value });
        return new Result(true, ErrorCode.NotFound, "Not found");
      }
      log.debug("Successfully found", `${this.entityName}/read`, { id: value });
      return new Result(false, ErrorCode.Success, "Success in read", result);
    } catch (error) {
      log.error("Error in reading", `${this.update}/read`, error, {
        id: value,
      });
      return new Result(
        true,
        ErrorCode.InternalServerError,
        "Error in reading"
      );
    }
  }

  /**
   * Update a single entity
   * @param id Id or the find where options of the entity to be updated
   * @param values Values to be updated
   * @param manager EntityManager to be used for the operation (optional). Use only for transactions
   * @returns Result with the number of rows updated
   */
  async update(
    id: string | number | FindOptionsWhere<Entity>,
    values: QueryDeepPartialEntity<Entity>,
    manager?: EntityManager
  ): Promise<Result<number | null>> {
    if (!manager) {
      manager = this.database.getConnection().createEntityManager();
    }
    const repository = manager.getRepository(this.entity);
    const copy = { ...values };
    try {
      const result = await repository.update(id, copy);
      if (result.affected === 0) {
        log.debug("Update not found", `${this.entityName}/update`, { id });
        return new Result(true, ErrorCode.NotFound, "Not found");
      }
      log.debug("Successfully updated", `${this.entityName}/update`, { id });
      return new Result(
        false,
        ErrorCode.Success,
        "Success in update",
        result.affected ?? null
      );
    } catch (error) {
      log.error("Error in updating", `${this.entityName}/update`, error, {
        id,
        copy,
      });
      return new Result(
        true,
        ErrorCode.InternalServerError,
        "Error in updating",
        null
      );
    }
  }

  /**
   * Parses the filter values. It parses the values like true and false which
   * comes from query params as string to boolean and also converts the array
   * based filters to In
   */
  parseFilter(
    where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[]
  ): FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[] {
    if (where instanceof Array) {
      where = where.map((it) =>
        this.parseFilter(it)
      ) as FindOptionsWhere<Entity>[];
      return where;
    }
    Object.keys(where).forEach((key) => {
      if ((where as any)[key] instanceof Array) {
        (where as any)[key] = In((where as any)[key]);
      }
      if ((where as any)[key] === "true") {
        (where as any)[key] = true;
      }
      if ((where as any)[key] === "false") {
        (where as any)[key] = false;
      }
    });
    return where;
  }

  /**
   * Parses sort values. Sort object to work across relations need to have
   * syntax: { entity: {field: ASC }}
   *
   */
  parseForSort(field: keyof Entity, order: "ASC" | "DESC") {
    const result: any = {};
    let level = result;
    const sortLevels = field.toString().split(".") || [];

    for (let i = sortLevels.length - 1; i >= 0; i--) {
      const prop = sortLevels[i];
      if (i === sortLevels.length - 1) {
        level[prop] = order || "ASC";
      } else {
        const newLevel = { [prop]: level };
        level = newLevel;
      }
    }
    return level;
  }

  /**
   * Parses the like values. It parses the values to ILike for case insensitive
   * search. It takes a likeBehaviour which can be 'and' or 'or'. This dictates
   * how the like values are combined. If 'and' is passed, all the values are
   * combined with AND. If 'or' is passed, all the values are combined with OR.
   */
  parseForLike(
    like?: { [key: string]: string },
    likeBehaviour: "and" | "or" = "and"
  ) {
    let parsedLike: { [key: string]: string } | { [key: string]: string }[];

    if (like && likeBehaviour === "and") {
      parsedLike = Object.keys(like).reduce((acc, it) => {
        acc[it] = ILike((like as any)[it] as string);
        return acc;
      }, {} as any);
    } else if (like && likeBehaviour === "or") {
      parsedLike = Object.keys(like).map((it) => ({
        [it]: ILike((like as any)[it]),
      })) as any;
      if ((parsedLike?.length ?? 0) === 0) {
        parsedLike = {};
      }
    } else {
      parsedLike = {};
    }

    return parsedLike;
  }

  /**
   * Parses the date values. It parses the values to MoreThanOrEqual AND
   * LessThanOrEqual for date range search. It takes a from and to 2024-03-21
   * values. If both are passed, it combines them with Between. If only fromCreatedDate
   * is passed, it uses MoreThanOrEqual. If only toCreatedDate is passed, it uses
   * LessThanOrEqual.
   */
  parseForDates(
    field: keyof Entity,
    from?: Date | string,
    to?: Date | string,
    where?: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[]
  ) {
    if (from && to && !(where instanceof Array)) {
      if (!where) {
        where = {};
      }
      where = { ...where, [field]: Between(from, to) };
    } else if (from && !(where instanceof Array)) {
      if (!where) {
        where = {};
      }
      where = { ...where, createdAt: MoreThanOrEqual(from) };
    } else if (to && !(where instanceof Array)) {
      if (!where) {
        where = {};
      }
      where = { ...where, createdAt: LessThanOrEqual(to) };
    }
    return where;
  }

  /**
   * Parses the where values. It combines all the values like where, like, fromCreatedDate
   * and toCreatedDate to a single where object. It also takes a likeBehaviour which can
   * be 'and' or 'or'. This dictates how the like values are combined. If 'and' is passed,
   * all the values are combined with AND. If 'or' is passed, all the values are combined
   * with OR.
   */
  parseWhere(
    where?: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
    like?: { [key: string]: string },
    likeBehaviour?: "and" | "or",
    fromCreatedDate?: Date,
    toCreatedDate?: Date
  ) {
    if (where) {
      where = this.parseFilter(where);
    }

    where = this.parseForDates(
      "createdAt",
      fromCreatedDate,
      toCreatedDate,
      where
    );

    const parsedLike = this.parseForLike(like, likeBehaviour);

    where = this.mergeParseLikeWhere(parsedLike, like, likeBehaviour, where);

    return where;
  }

  /**
   * Merges the parsed like values with the where values. It takes a parsedLike
   * which is the parsed like values, like which is the original like values, likeBehaviour
   * which can be 'and' or 'or'.
   */
  mergeParseLikeWhere(
    parsedLike: { [key: string]: string } | { [key: string]: string }[],
    like?: { [key: string]: string },
    likeBehaviour?: "and" | "or",
    where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[] = {}
  ) {
    if (likeBehaviour === "and") {
      where = { ...where, ...(parsedLike as any) };
    } else if (likeBehaviour === "or" && parsedLike instanceof Array) {
      where = parsedLike.map((a) => {
        return { ...where, ...a };
      }) as FindOptionsWhere<Entity>[];
    } else {
      where = { ...where, ...(parsedLike as any) };
    }
    return where;
  }

  /**
   * Read a paginated list of entities
   * @returns Result with the list of entities
   */
  async readMany(
    options?: ReadManyOption<Entity>,
    manager?: EntityManager
  ): Promise<WithCount<Result<Entity[]>>> {
    const {
      page = 1,
      count = 10,
      order = "DESC",
      field = "createdAt" as keyof Entity,
      where,
      fromCreatedDate,
      toCreatedDate,
      like,
      likeBehaviour = "and",
      nonPaginated = false,
      dbOptions,
    } = options ?? {};
    if (!manager) {
      manager = this.database.getConnection().createEntityManager();
    }
    const repository = manager.getRepository(this.entity);

    try {
      const parsedWhere = this.parseWhere(
        where,
        like,
        likeBehaviour,
        fromCreatedDate,
        toCreatedDate
      );
      const orderValue: any = this.parseForSort(field, order);

      log.debug("Read many values", "readMany", { orderValue, parsedWhere });

      const findOptions = {
        where: parsedWhere,
        order: orderValue,
        ...dbOptions,
      };
      if (!nonPaginated) {
        findOptions["skip"] = (page - 1) * count;
        findOptions["take"] = count;
      }

      const result = await repository.find(findOptions);
      log.debug("Successfully found", `${this.entityName}/readMany`, {
        page,
        count,
        orderValue,
        field,
      });
      const totalCount = await repository.count({ where: parsedWhere });
      return new ResultWithCount(
        false,
        ErrorCode.Success,
        "Success in readMany",
        result,
        totalCount
      );
    } catch (error) {
      log.error("Error in reading", `${this.entityName}/readMany`, error, {
        page,
        count,
        order,
        field,
      });
      return new ResultWithCount(
        true,
        ErrorCode.InternalServerError,
        "Error in reading",
        null,
        null
      );
    }
  }

  /**
   * Delete entities
   * @param id Id , ids or Conditions of the entity to be deleted
   * @param manager EntityManager to be used for the operation (optional). Use only for transactions
   * @returns
   */
  async delete(
    id: string | number | string[] | FindOptionsWhere<Entity>,
    manager?: EntityManager
  ): Promise<Result<number>> {
    if (!manager) {
      manager = this.database.getConnection().createEntityManager();
    }
    const repository = manager.getRepository(this.entity);
    try {
      const result = await repository.delete(id);

      if (result.affected === 0) {
        log.debug("Delete not found", `${this.entityName}/delete`, { id });
        return new Result(
          true,
          ErrorCode.NotFound,
          "Not found",
          result.affected
        );
      }
      log.debug("Successfully deleted", `${this.entityName}/delete`, { id });
      return new Result(
        false,
        ErrorCode.Success,
        "Success in delete",
        result.affected ?? 0
      );
    } catch (error) {
      log.error("Error in deleting", `${this.entityName}/delete`, error, {
        id,
      });
      return new Result(
        true,
        ErrorCode.InternalServerError,
        "Error in deleting"
      );
    }
  }
}
