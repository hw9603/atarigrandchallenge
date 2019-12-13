import sys
import os
import random
from keys import *
from flask import Flask, render_template, request, jsonify, make_response, redirect
from flask_compress import Compress
from flask_sqlalchemy import SQLAlchemy
from Models import db, Action, Game, Trajectory
import json
import numpy as np
from flask_mobility import Mobility
from flask_mobility.decorators import mobile_template
from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

from PIL import Image
from io import BytesIO
import base64
import cv2
FLASK_ADDR = "127.0.0.1:2333"
#FLASK_ADDR = "34.73.204.174:4242"
DATASET_PATH = 'data/'

def get_trajectory(trajectory_id):
  traj = Trajectory.query.filter_by(id=trajectory_id).first()
  rom = Game.query.filter_by(id=traj.game_id).first().rom
  print(rom)
  if traj.actions == None:
    print("actions NONE")
    return None
  if traj.init_state == None:
    print("init_state NONE")
    return None
  if rom == None:
    print("rom NONE")
    return None
  if traj.id == None:
    print("id NONE")
    return None
  if traj.time_stamp == None:
    print("timestamp NONE")
    return None
  return jsonify(**{'trajectory':json.loads(traj.actions), 'init_state':json.loads(traj.init_state), 'rom':rom, 'seqid':traj.id, 'timestamp':traj.time_stamp})

def save_trajectory(rom, resp, driver):
  if rom not in ['qbert', 'spaceinvaders', 'mspacman', 'pinball', 'revenge','seaquest']:
    return 'Unknown rom', 400
  traj = resp['trajectory']
  # get last file in the folder num
  rom_dir = os.path.join(DATASET_PATH, 'trajectories', rom)
  dir_files = os.listdir(rom_dir)
  fn = int(resp['seqid']) #start naming from 0
  with open(os.path.join(rom_dir, str(fn)) + '.txt', 'w') as f:
    max_score = 0
    f.write('db traj id : %s, timestamp: %s\n' % (resp['seqid'], resp['timestamp']))
    f.write('frame\treward\tscore\tterminal\taction\tram_state\n')
    count = 0
    for k in sorted(traj.keys(), key=int):
      ct = traj[k]
      if(int(ct['score']) > max_score and count > 5):
        max_score = int(ct['score'])
      count += 1
      f.write('%s\t%s\t%s\t%d\t%s\t%s\n' % (k,ct['reward'],ct['score'],int(ct['terminal']),ct['action'],ct['ram_state']))
  os.rename(os.path.join(rom_dir,str(fn))+'.txt', os.path.join(rom_dir, str(fn)) + '-' + str(max_score) + '.txt')
#  return True
  screen_rom_dir = os.path.join(DATASET_PATH, 'screens', rom, str(fn))
  os.makedirs(screen_rom_dir, exist_ok=True)
  print('Replaying %d traj' % fn)
  # inside each frame of the replay, we get the screenshot and
  # send ajax request to another server with trajectory, rom name and the screnshot
  # the server save screenshot and the trajectory to dirs based on rom name
  addr = "http://" + FLASK_ADDR + "/replay/" + str(fn)
  print(addr)
  driver.get(addr)
  # driver.get("http://%s/replay/%d" % (FLASK_ADDR, i))
#  max_wait_time = driver.execute_script("return Javatari.room.console.traj_max_frame;")/60 + 20  # +20 sec to be sure
  max_wait_time = 600
  try:
    element = WebDriverWait(driver, max_wait_time).until(EC.alert_is_present())
    alert = driver.switch_to_alert()
    alert.accept()
  except TimeoutException:
    print('timeout exception')
  return True

def main(argv):
    options = webdriver.ChromeOptions()
    options.add_argument('headless')
    driver = webdriver.Chrome(chrome_options=options)
    for i in range(int(argv[1]), int(argv[2])+1):
        traj = get_trajectory(i)
        if traj == None:
            print("Traj " + str(i) + " FAILED, CONTINUED")
            continue
        resp = traj.json
        if save_trajectory(resp['rom'], resp, driver):
            print("trajectory Saved " + str(i))
    print("EXIT")

if __name__ == "__main__":
    if len(sys.argv) == 3:
#        DATASET_PATH = 'data/'
        global app
        app = Flask(__name__)
        app.config['UPLOAD_FOLDER'] = '.'
        app.config['ALLOWED_EXTENSIONS'] = set(['txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif'])
        app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 4 #4mb
        Mobility(app)
        app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://'+DB_USER+':'+DB_PASSWORD+'@localhost/atari'
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        db.init_app(app)
        with app.app_context():
            db.create_all()
            main(sys.argv)
    else:
        print("Usage:python3 data_dump.py [traj_id_start] [traj_id_end]")
        sys.exit()
