import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users/admin-users.controller';
import { AdminUsersService } from './admin-users/admin-users.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminTokenService } from './auth/admin-token.service';
import { LoginRateLimiter } from './auth/login-rate-limiter';
import { CONTENT_CONTROLLERS } from './contents/contents.controller';
import { ContentsService } from './contents/contents.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { LatexController } from './latex/latex.controller';
import { LatexService } from './latex/latex.service';
import { CurriculumController } from './curriculum/curriculum.controller';
import { CurriculumService } from './curriculum/curriculum.service';
import { ExerciseEditorController } from './exercises/exercise-editor.controller';
import { ExerciseEditorService } from './exercises/exercise-editor.service';
import { TranslationsController } from './translations/translations.controller';
import { TranslationsService } from './translations/translations.service';
import { GenerateQuestionController } from '../generate-question/generate-question.controller';
import { GenerateQuestionService } from '../generate-question/generate-question.service';
import { ExerciseWriter } from '../generate-question/exercise-writer';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';
import { RECORD_CONTROLLERS } from './records/records.controller';
import { RecordsService } from './records/records.service';

/** Admin panel API (replaces ActiveAdmin). Each migrated module adds its admin controllers here. */
@Module({
  controllers: [AdminAuthController, DashboardController, AnalyticsController, RolesController, AdminUsersController, NotificationsController, LatexController, TranslationsController, ExerciseEditorController, GenerateQuestionController, CurriculumController, ...CONTENT_CONTROLLERS, ...RECORD_CONTROLLERS],
  providers: [AdminTokenService, AdminAuthGuard, AdminAuthService, LoginRateLimiter, RolesService, AdminUsersService, ContentsService, RecordsService, NotificationsService, LatexService, TranslationsService, ExerciseEditorService, GenerateQuestionService, ExerciseWriter, CurriculumService],
})
export class AdminModule {}
