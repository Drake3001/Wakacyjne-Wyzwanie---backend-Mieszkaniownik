import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role, User } from "@prisma/client";

import { UpdateUserDto } from "./dto/update-user.dto";
import { UserService } from "./user.service";

@Controller("user")
@ApiTags("user")
export class UserController {
  constructor(private userService: UserService) {}

  @Patch("update/:email")
  @ApiOperation({ summary: "Update a user by email" })
  @ApiResponse({ status: 200, description: "User updated successfully" })
  @ApiResponse({ status: 403, description: "Missing permission" })
  @ApiResponse({ status: 404, description: "User not found" })
  async update(
    @Param("email") email: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.updateUserData(email, updateUserDto);
  }

  @ApiOperation({
    summary: "Disable the given user account",
  })
  @ApiResponse({
    status: 204,
    description: "User disabled",
  })
  @ApiResponse({
    status: 400,
    description: "Cannot disable an admin account",
  })
  @ApiResponse({
    status: 403,
    description: "Missing privileges",
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("disable/:email")
    async disableUser(@Param("email") email: string) {
    return this.userService.disableAccount(email);
  }

  @ApiOperation({
    summary: "Enable the given user account",
  })
  @ApiResponse({
    status: 204,
    description: "User enabled",
  })
  @ApiResponse({
    status: 403,
    description: "Missing privileges",
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("enable/:email")
  async enableUser(@Param("email") email: string) {
    return this.userService.enableAccount(email);
  }
}