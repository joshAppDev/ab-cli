//
// setup
// create the local config options for the AppBuilder runtime.
//
// options:
//  --port : the port to listen on for the local system
//  --tag  : the docker tag of the images to run
//
var async = require("async");
var fs = require("fs");
var inquirer = require("inquirer");
var path = require("path");
var utils = require(path.join(__dirname, "utils", "utils"));

var Options = {}; // the running options for this command.

const GeneratedFiles = {
   // source file :  generated file
   "source.dbinit-compose.yml": "dbinit-compose.yml",
   "source.docker-compose.yml": "docker-compose.yml",
   "source.docker-compose.dev.yml": "docker-compose.dev.yml"
};
//
// Build the Command
//
var Command = new utils.Resource({
   command: "setup",
   params: "--port [port#] --tag [dockerTag]",
   descriptionShort:
      "setup the running configuration for an AppBuilder config.",
   descriptionLong: `
`
});

module.exports = Command;

/**
 * @function help
 * display specific help instructions for the setup command.
 */
Command.help = function() {
   console.log(`

  usage: $ appbuilder setup [options]

  Update the appbuilder configuration .

  [options] :
    --port [port#] : <number> specify the port to listen on

    --stack=[ab] : the Docker Stack reference ("ab" by default) to use for this install.

    --tag [master,develop] : <string> which version of the Docker containers to use.


    settings for ssl:
    --ssl.[option] : see $ appbuilder ssl --help for list of options

    settings for bot_manager:
    --bot.[option]

    --bot.botEnable [true,false] : enable the #Slack bot
    --bot.botToken [token]    : enter the #Slack bot API token
    --bot.botName [name]      : the name displayed for the #Slack bot
    --bot.slackChannel [name] : which #Slack channel to interact with
    --bot.hosttcpport [port#] : (on Mac OS) specify a host port for
                                the command processor

    settings for notification_email:
    --smtp.[option]


  examples:

    $ appbuilder setup --port 8080 --tag master
        - edits docker-compose.yml to listen on port 8080
        - edits docker-compose.yml to use :master containers
        - asks questions for the remaining configuration options

`);
};

Command.run = function(options) {
   options = options || {};

   return new Promise((resolve, reject) => {
      // display help instructions if that was requested.
      if (options.help) {
         Command.help();
         process.exit();
         return;
      }

      async.series(
         [
            // copy our passed in options to our Options
            (done) => {
               for (var o in options) {
                  Options[o] = options[o];
               }
               done();
            },
            questions,
            removeGeneratedFiles,
            generateFiles,
            copyTemplateFiles,
            patchDockerStack,
            setupSSL,
            setupDB,
            setupBotManager,
            setupNotificationEmail
         ],
         (err) => {
            if (err) {
               reject(err);
               return;
            }
            resolve();
         }
      );
   });
};

/**
 * @function questions
 * Present the user with a list of configuration questions.
 * If the answer for a question is already present in Options, then we
 * skip that question.
 * @param {cb(err)} done
 */
function questions(done) {
   inquirer
      .prompt([
         {
            name: "stack",
            type: "input",
            message:
               "What Docker Stack reference do you want this install to use:",
            default: "ab",
            when: (values) => {
               return !values.stack && !Options.stack;
            }
         },
         {
            name: "port",
            type: "input",
            message: "What port do you want AppBuilder to listen on (80):",
            default: 80,
            when: (values) => {
               return !values.port && !Options.port;
            }
         },
         {
            name: "exposeDB",
            type: "confirm",
            message: "Do you want to expose the DB :",
            default: false,
            when: (values) => {
               return (
                  !values.exposeDB && typeof Options.exposeDB == "undefined"
               );
            }
         },
         {
            name: "portDB",
            type: "input",
            message: "What port do you want the DB to listen on:",
            default: 3306,
            when: (values) => {
               return values.exposeDB && !values.portDB && !Options.portDB;
            }
         },
         {
            name: "tag",
            type: "input",
            message: "Which Docker Tags to use [master, develop]:",
            default: "master",
            filter: (input) => {
               if (input == "") {
                  return "master";
               } else {
                  return input;
               }
            },
            validate: (input) => {
               return !input ||
                  ["master", "develop"].indexOf(input.toLowerCase()) != -1
                  ? true
                  : `"master" or "develop"`;
            },
            when: (values) => {
               return !values.tag && !Options.tag;
            }
         }
      ])
      .then((answers) => {
         for (var a in answers) {
            Options[a] = answers[a];
         }
         // make sure portDB has a default value before generating Files:
         if (!Options.exposeDB) {
            Options.portDB = "8889";
         }
         // console.log("Options:", Options);
         done();
      })
      .catch(done);
}

/**
 * @function removeGeneratedFiles
 * Remove any generated files
 * @param {cb(err)} done
 */
function removeGeneratedFiles(done) {
   var generatedFiles = Object.keys(GeneratedFiles).map((k) => {
      return GeneratedFiles[k];
   });
   var cwd = process.cwd();
   async.each(
      generatedFiles,
      (file, cb) => {
         var pathFile = path.join(cwd, file);
         fs.unlink(pathFile, (err) => {
            if (err) {
               // console.log(err);
            }
            cb();
         });
      },
      (err) => {
         done(err);
      }
   );
}

/**
 * @function generateFiles
 * generate files
 * @param {cb(err)} done
 */
function generateFiles(done) {
   var sourceFiles = Object.keys(GeneratedFiles);
   var cwd = process.cwd();

   var nonExposeDBTag = /image:\s*mariadb\s*\n\s*ports:\s*\n\s*-/;
   var nonExposeDBReplace = `image: mariadb
    # ports:
    #   -`;

   async.each(
      sourceFiles,
      (file, cb) => {
         // render the source files
         var pathSourceFile = path.join(cwd, file);
         var contents = utils.fileRender(pathSourceFile, Options);

         if (!Options.exposeDB) {
            contents = contents.replace(nonExposeDBTag, nonExposeDBReplace);
         }

         // write them to the destination files
         var pathFile = path.join(cwd, GeneratedFiles[file]);
         fs.writeFile(pathFile, contents, (err) => {
            if (err) {
               console.log(err);
            }
            cb(err);
         });
      },
      (err) => {
         done(err);
      }
   );
}

/**
 * @function copyTemplateFiles
 * copy our template files into the project
 * @param {cb(err)} done
 */
function copyTemplateFiles(done) {
   utils.fileCopyTemplates("setup", {}, [], done);
}

/**
 * @function patchDockerStack
 * update the support scripts to reference a Docker stack specific to this
 * install.
 * @param {cb(err)} done
 */
function patchDockerStack(done) {
   // Docker Stack update:
   utils.filePatch(
      [
         // patch our npm commands to reference our Docker Stack
         {
            file: path.join(process.cwd(), Options.name, "package.json"),
            tag: / ab/g,
            replace: ` ${Options.stack || "ab"}`,
            log: `    Docker Stack: package.json => ${Options.stack || "ab"}`
         },
         {
            file: path.join(process.cwd(), Options.name, "cli.sh"),
            tag: /ab_/g,
            replace: `${Options.stack || "ab"}_`,
            log: `    Docker Stack: logs.js => ${Options.stack || "ab"}`
         },
         {
            file: path.join(process.cwd(), Options.name, "Down.sh"),
            tag: / ab/g,
            replace: ` ${Options.stack || "ab"}`,
            log: `    Docker Stack: Down.sh => ${Options.stack || "ab"}`
         },
         {
            file: path.join(process.cwd(), Options.name, "logs.js"),
            tag: /ab_/g,
            replace: `${Options.stack || "ab"}_`,
            log: `    Docker Stack: logs.js => ${Options.stack || "ab"}`
         },
         {
            file: path.join(process.cwd(), Options.name, "UP.sh"),
            tag: / ab/g,
            replace: ` ${Options.stack || "ab"}`,
            log: `    Docker Stack: UP.sh => ${Options.stack || "ab"}`
         }
      ],
      done
   );
}

/**
 * @function setupSSL
 * run the ssl setup command.
 * @param {cb(err)} done
 */
function setupSSL(done) {
   var sslCommand = require(path.join(__dirname, "ssl.js"));

   // scan Options for ssl related options:
   // "ssl.self"
   // "ssl.pathKey ssl.pathCert"
   // "ssl.none"
   var sslOptions = Options.ssl || {};
   for (var o in Options) {
      var parts = o.split(".");
      if (parts[0] == "ssl") {
         sslOptions[parts[1]] = Options[o];
      }
   }

   sslCommand
      .run(sslOptions)
      .then(done)
      .catch(done);
}

/**
 * @function setupBotManager
 * run the configBotManager setup command.
 * @param {cb(err)} done
 */
function setupBotManager(done) {
   var botManagerCommand = require(path.join(
      __dirname,
      "tasks",
      "configBotManager.js"
   ));

   // scan Options for bot_manager related options:
   // "bot.dhEnabled, bot.dhPort"
   // "bot.botEnable, bot.botToken, bot.botName, bot.slackChannel"
   // "bot.hosttcpport"
   var botOptions = {
      dhEnable: false,
      dhPort: 14000,
      dockerTag: Options.tag
   };

   // capture any existing .bot values:
   if (Options.bot) {
      for (var b in Options.bot) {
         botOptions[b] = Options.bot[b];
      }
   }

   // find any possible "bot.param" values
   for (var o in Options) {
      var parts = o.split(".");
      if (parts[0] == "bot") {
         botOptions[parts[1]] = Options[o];
      }
   }

   botManagerCommand
      .run(botOptions)
      .then(done)
      .catch(done);
}

/**
 * @function setupDB
 * run the configDB setup command.
 * @param {cb(err)} done
 */
function setupDB(done) {
   var configDBCommand = require(path.join(__dirname, "tasks", "configDB.js"));

   // scan Options for db related options:
   // "db.password
   var dbOptions = {};

   // capture any existing .db values:
   if (Options.db) {
      for (var b in Options.db) {
         dbOptions[b] = Options.db[b];
      }
   }

   // find any possible "bot.param" values
   for (var o in Options) {
      var parts = o.split(".");
      if (parts[0] == "db") {
         dbOptions[parts[1]] = Options[o];
      }
   }

   configDBCommand
      .run(dbOptions)
      .then(done)
      .catch(done);
}

/**
 * @function setupNotificationEmail
 * run the configNotificationEmail setup command.
 * @param {cb(err)} done
 */
function setupNotificationEmail(done) {
   var notificationEmailCommand = require(path.join(
      __dirname,
      "tasks",
      "configNotificationEmail.js"
   ));

   // scan Options for ssl related options:
   // smtp.smtpEnabled
   // smtp.smtpHost,
   // smtp.smtpTLS
   // smtp.smtpPort
   // smtp.smtpAuth, smtp.smtpAuthUser, smtp.smtpAuthPass
   var emailOptions = {};

   for (var o in Options) {
      var parts = o.split(".");
      if (parts[0] == "smtp") {
         emailOptions[parts[1]] = Options[o];
      }
   }

   notificationEmailCommand
      .run(emailOptions)
      .then(done)
      .catch(done);
}
